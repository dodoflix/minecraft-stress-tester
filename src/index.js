const mineflayer = require('mineflayer');

// Server utilities
const {host, port} = require('./config.json');

// Bot utilities
const {count} = require('./config.json');

const bot = mineflayer.createBot({
    host: host,
    port: port,
    username: 'Test',
});

bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    bot.chat(`${username}: ${message}`);
});

bot.on('kicked', console.log);
bot.on('error', console.log);