const {chatSpamEnabled, chatSpamMessage, chatSpamDelay} = require('../config.json');

module.exports = bot => {
    let spammer
    let spammed = false
    bot.chatSpam = {}

    bot.on('spawn', () => {
        if (chatSpamEnabled) {
            bot.chatSpam.start()
        }
    })

    bot.on('kicked', () => {
        if (chatSpamEnabled) {
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