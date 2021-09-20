module.exports = bot => {
    let rotater
    let rotated = false
    bot.antiAfk = {}

    bot.antiAfk.start = () => {
        if (rotater) return
        rotater = setInterval(rotate, 3000)
    }

    bot.antiAfk.stop = () => {
        if (!rotater) return
        clearInterval(rotater)
    }

    function rotate () {
        bot.look(rotated ? 0 : Math.PI, 0)
        rotated = !rotated
    }
}