const mineflayer = require('mineflayer');

const {host, port} = require('./config.json');

const {count} = require('./config.json') ?? 10;
const {prefix} = require('./config.json');

let bots = [];

function between(min, max) {
    return Math.floor(
        Math.random() * (max - min) + min
    )
}

for (let i = 0; i < count; i++) {
    bots.push(mineflayer.createBot({
        host: host,
        port: port,
        username: `${prefix}${between(100, 999)}`,
    }));
}

bots.forEach(bot => {
    bot.once('spawn', () => {
        bot.chat(`${bot.username} is here!`)
    });

    bot.on('chat', (username, message) => {
        if (username.toString().startsWith(prefix)) return;
        bot.chat(`${username}: ${message}`);
    });

    bot.on('kicked', console.log);
    bot.on('error', console.log);
});