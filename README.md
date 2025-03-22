
# MelonBot

Kit making bot for 2b2t. Controllable through a discord bot and web GUI. More features to come. 


## Authors

- [@kwy3](https://www.github.com/kwy3)
- [@nova3ris](https://www.github.com/nova3ris)



## Installation

Install node.js if not already installed from here:
https://nodejs.org/

Instal git if not already installed:
https://github.com/git-guides/install-git

Open terminal and navigate to the directory you wish to install in, then run the following

```bash
  git clone https://github.com/kwy3/MelonMenBot
  cd MelonMenBot
  npm install
```
    
## Run Locally
Navigate to the discord developer portal:

https://discord.com/developers/applications

Click "New Application"
- Name it "MelonMenBot" or something similar
- After creating the application navigate to the bot tab
- Click "Reset Token" and copy the token into config.json file field for "discordToken" 
- Make sure to the save the config.json file
- Scroll down in the same tab and turn on Server Members Intent and Message Content Intent
- Navigate to the OAuth2 tab next
- Click the "bot" scope
- For permissions give send messages, view channels, and read message history
- Create a new empty discord server for yourself
- Copy the generated url at the bottom of OAuth2 into your browser and follow the instructions to add the bot to the server you made

Now in terminal if you are not already in the MelonMenBot directory run

**If this is for testing purposes then start a new singleplayer world and open to LAN**
- In config.json set the port to the lan port
- In config.json set the host to `localhost`

**If this is for 2b2t use then**
- In config.json set leave the port field blank
- In config.json set the host to `2b2t.org`
- In config.json change the username to your accounts UUID
- You will be prompted in terminal to verify the account with microsoft upon starting the bot. 

**How To Start**

Do the following if not already in the MelonMenBot directory
```bash
cd MelonMenBot
```

Start the bot

```bash
node app.js
```
Use `!help` to view discord bot commands 

Go to `localhost:3000` in your web browser to view the web gui

