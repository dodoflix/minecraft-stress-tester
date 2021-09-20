const mineflayer = require('mineflayer');

const {host, port} = require('./config.json');

const {count} = require('./config.json') ?? 10;
const {prefix} = require('./config.json');
const {password} = require('./config.json') ?? "123123asD@";

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
        plugins: [require('./modules/afk.js')],
        verbose: true
    }));
}

bots.forEach(bot => {
    bot.once('spawn', () => {
        bot.chat(`${bot.username} is here!`);
        bot.chat(`/register ${password} ${password}`);
        bot.chat(`/login ${password}`);
    });

    bot.on('chat', (username, message) => {
        if (username.toString().startsWith(prefix)) return;
        bot.chat(`${username}: ${message}`);
    });

    bot.on('kicked', () => {
        bots.push(mineflayer.createBot({
            host: bot.host,
            port: bot.port,
            username: bot.username,
            plugins: bot.plugins,
            verbose: bot.verbose
        }));
        const index = bots.indexOf(bot);
        if(index > -1) {
            bots.splice(index, 1);
        }
    });
    bot.on('error', () => {
        bots.push(mineflayer.createBot({
            host: bot.host,
            port: bot.port,
            username: bot.username,
            plugins: bot.plugins,
            verbose: bot.verbose
        }));
        const index = bots.indexOf(bot);
        if(index > -1) {
            bots.splice(index, 1);
        }
    });
});