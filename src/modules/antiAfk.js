const {antiAfkEnabled} = require('../config.json')

module.exports = bot => {
    let rotater
    let rotated = false
    bot.antiAfk = {}

    bot.on('spawn', () => {
        if (antiAfkEnabled) {
            bot.antiAfk.start()
        }
    })

    bot.on('kicked', () => {
        if (antiAfkEnabled) {
            bot.antiAfk.stop()
        }
    })

    bot.antiAfk.start = () => {
        if (rotater) return
        rotater = setInterval(rotate, 3000)
    }

    bot.antiAfk.stop = () => {
        if (!rotater) return
        clearInterval(rotater)
    }

    function rotate() {
        bot.look(rotated ? 0 : Math.PI, 0)
        rotated = !rotated
    }
}