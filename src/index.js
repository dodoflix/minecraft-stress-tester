const mineflayer = require('mineflayer')

const {host, port} = require('./config.json')

const {count} = require('./config.json')
const {prefix} = require('./config.json')


let bots = []

for (let i = 0; i < count; i++) {
    bots.push(mineflayer.createBot({
        host: host,
        port: port,
        username: `${prefix}${between(1000, 9999)}`,
        plugins: {
            antiAfk: require('./modules/antiAfk'),
            chatSpam: require('./modules/chatSpam'),
            authentication: require('./modules/authentication'),
            logger: require('./modules/logger'),
            reconnection: require('./modules/reconnection')
        }
    }))
}

module.exports = {
    bots: bots
}

function between(min, max) {
    return Math.floor(
        Math.random() * (max - min) + min
    )
}