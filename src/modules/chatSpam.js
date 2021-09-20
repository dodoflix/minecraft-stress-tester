const {chatSpamEnabled, chatSpamMessage, chatSpamDelay} = require('../config.json');

module.exports = bot => {
    let spammer
    let spammed = false
    bot.chatSpam = {}

    bot.on('spawn', () => {
        if (chatSpamEnabled) {
            console.log(`ChatSpam has been started for ${bot.username}.`)
            bot.chatSpam.start()
        }
    })

    bot.on('kicked', () => {
        if (chatSpamEnabled) {
            console.log(`ChatSpam has been stopped for ${bot.username}`)
            bot.chatSpam.stop()
        }
    })

    bot.chatSpam.start = () => {
        if (spammer) return
        spammer = setInterval(spam, chatSpamDelay)
    }


    bot.chatSpam.stop = () => {
        if (!spammer) return
        clearInterval(spammer)
    }

    function spam() {
        bot.chat(chatSpamMessage)
        spammed = !spammed
    }
}