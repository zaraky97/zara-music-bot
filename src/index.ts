import { Client, Guild, Intents } from 'discord.js';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import {
  createAudioPlayer,
  DiscordGatewayAdapterCreator,
  getVoiceConnections,
  joinVoiceChannel,
  VoiceConnection,
} from '@discordjs/voice';
import { getMusic } from './firestore/getMusic';
import { updateMusic } from './firestore/updateMusic';
import { playMusic } from './playMusic';

require('dotenv').config();

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECTID,
    clientEmail: process.env.FIREBASE_CLIENTEMAIL,
    privateKey: process.env.FIREBASE_PRIVATEKEY
      ? process.env.FIREBASE_PRIVATEKEY.replace(/\\n/g, '\n')
      : '',
  }),
});

const db = getFirestore();
var connection: VoiceConnection | undefined = undefined;
const audioPlayer = createAudioPlayer();

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_VOICE_STATES,
  ],
});

client.on('ready', () => {
  console.log(`${client.user?.tag} でログインしています。`);
});

client.on('messageCreate', async (msg) => {
  const userId = msg.member?.user.id;
  const username = msg.member?.user.username;
  if (msg.content === 'Hello') msg.reply('Hi');
  if (msg.content === 'こんにちは') {
    msg.channel.send('オイッスー！');
  }
  if (msg.content === '!music-help') {
    msg.channel.send(
      '曲の登録・更新\n```!music-update youtubeのurl 始まりの時間(s) 動画の長さ(s)\n例）!music-update https://www.youtube.com/watch?v=upODO6OuOOk 9 15```'
    );
    msg.channel.send('自分が登録した曲の確認\n```!music-me```');
    // msg.channel.send('サーバーに登録されている曲の確認\n```!music-list```');
    msg.channel.send('曲を止めたいとき\n```!music-stop```');
  }
  if (msg.content === '!music-me') {
    if (!userId) return;
    const storeMusicdata = await getMusic(db, 'users', userId);
    if (!storeMusicdata) {
      msg.channel.send('登場曲が見つからないッス');
    } else {
      msg.channel.send(
        `${username}の登場曲: ${storeMusicdata.music.urls} ${storeMusicdata.music.start} ${storeMusicdata.music.duration}`
      );
    }
  }
  if (msg.content.includes('!music-update')) {
    const msgArray = msg.content.split(' ');
    if (!msgArray[1].includes('youtube.com')) return;
    const music = {
      urls: [msgArray[1]],
      start: msgArray[2] && !isNaN(+msgArray[2]) ? +msgArray[2] : 0,
      duration: msgArray[3] && !isNaN(+msgArray[3]) ? +msgArray[3] : 15,
    };
    if (!userId || !username) return;
    if (username === 'zara-music-bot') return;
    updateMusic(db, 'users', userId, { name: username, music });
    msg.channel.send(`更新! url: ${msgArray[1]}`);
  }
  if (msg.content === '!music-stop') {
    audioPlayer.stop();
  }
  if (msg.content.includes('!music-play')) {
    try {
      const voiceChannelId = msg.member?.voice.channelId;
      const msgArray = msg.content.split(' '); // example !music-play kochikame 2 url
      if (!msgArray[1] || !msgArray[2]) return;
      const storeMusicdata = await getMusic(db, msgArray[1], msgArray[2]);
      if (!msg.guild || !voiceChannelId) return;
      const currentConnection = getVoiceConnections().get(msg.guild.id);
      if (currentConnection) {
        audioPlayer.stop();
      }
      connection = joinChannel(msg.guild, voiceChannelId);
      if (!storeMusicdata) {
        if (!msgArray[3]) return;
        updateMusic(db, msgArray[1], msgArray[2], { url: msgArray[3] });
        playMusic(connection, audioPlayer, {
          urls: [msgArray[3]],
        });
      } else {
        playMusic(connection, audioPlayer, {
          urls: [storeMusicdata.url],
        });
      }
    } catch (e) {
      console.log(e);
    }
  }
});

client.on('voiceStateUpdate', async (oldMember, newMember) => {
  if (
    newMember.member?.user.username === 'zara-music-bot' ||
    oldMember.channelId === newMember.channelId
  )
    return;
  if (newMember.channelId) {
    if (!newMember.member?.user.username) return;
    const storeMusicdata = await getMusic(db, 'users', newMember.id.toString());
    if (!storeMusicdata) return;
    connection = joinChannel(newMember.guild, newMember.channelId);
    playMusic(connection, audioPlayer, storeMusicdata.music);
  } else {
    console.log(`Left voice channel ${newMember.member?.user.username}`);
  }
});
client.login(process.env.DISCORD_TOKEN);

function joinChannel(guild: Guild, channelId: string) {
  return joinVoiceChannel({
    guildId: guild.id,
    channelId: channelId ?? '',
    adapterCreator: guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });
}
