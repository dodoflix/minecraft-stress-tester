const client = require('mineflayer')

/* CONFIGURATION */
const serverIp = "127.0.0.1"
const serverPort = "25565"
const prefix = "dodoflix" // Null for empty
const botCount = 20 // Inf for infinite
const delay = 100 // Millisecond

/* VARIABLES */
botMap = new Map()
let currentBotCount = 0

/* MAIN */

createClients()

/*      */

function createClients(){
    if(currentBotCount < botCount){
        currentBotCount++
        setTimeout(() => {
            botMap.set(botCount, client.createBot({
                host: serverIp,
                port: serverPort,
                username: prefix + randomName(16 - prefix) // 16 is max for username
            }))
            createClients()
            console.log("Bot " + botCount + " sent.")
        }, delay)
    }
}

function randomName(length){
    let result = [];
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result.push(characters.charAt(Math.floor(Math.random() *
            charactersLength)));
    }
    return result.join('');
}