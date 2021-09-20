module.exports = bot => {
    bot.on('spawn', () => {
        console.log(`${bot.username} successfully connected.`)
    })

    bot.on('kicked', function (reason) {
        console.log(`${bot.username} is kicked for ${reason}.`)
    })

    bot.on('error', (error) => {
        console.log(error);
    })
}