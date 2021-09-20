const bots = require('../index').bots
const mineflayer = require("mineflayer")

module.exports = bot => {
    bot.on('kicked', () => {
        bot.quit()
        bot.end()
        bots.push(mineflayer.createBot({
            host: bot.host,
            port: bot.port,
            username: bot.username,
            plugins: bot.plugins
        }))
    })
}