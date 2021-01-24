const express = require('express')
const cors = require('cors')
const fs = require('fs')
const open = require('open')
const path = require('path')
const fetch = require('node-fetch')

const socket = require('socket.io')
const app = express()

app.use(express.json())
app.use(cors())
app.use('/teamsimg', express.static('teams'));

function readSettingsJson() {
	try {
		let data = JSON.parse(fs.readFileSync('./settings.json'))
		return data
	} catch (error) {
		console.log('file settings.json not found, sending default settings')
		return null
	}
}

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/index.html'))
})

app.get('/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/style.css'))
})

app.get('/assets/countries', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/countries.js'))
})

app.get('/assets/scoremodification', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/scoremodification.js'))
})

app.get('/app.js', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/app.js'))
})

app.get('/socketio', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/socket.io.min.js'))
})

app.get('/settings', (req, res) => {
	res.json(readSettingsJson())
})

app.get('/teams', (req, res) => {
	fs.readdir('./teams', async (err, data) => {	
		if(err){
			res.json(['nodata']);
			return
		}

		if(data == ''){
			res.json(['nodata']);
		} else {
			res.json(data)
		}

	})
})


// Default visualizer

app.get('/visualizer', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/default/visualizer.html'))
})

app.get('/visualizer/default', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/default/visualizer.html'))
})

app.get('/visualizer/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/default/style.css'))
})

// Rounded visualizer

app.get('/visualizer/rounded', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/rounded/visualizer.html'))
})

app.get('/visualizer/rounded/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/rounded/style.css'))
})

// Top corners rounded visualizer

app.get('/visualizer/top-rounded', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/top-rounded/visualizer.html'))
})

app.get('/visualizer/top-rounded/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/top-rounded/style.css'))
})

// Bottom corners rounded visualizer

app.get('/visualizer/bottom-rounded', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/bottom-rounded/visualizer.html'))
})

app.get('/visualizer/bottom-rounded/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/bottom-rounded/style.css'))
})

// -----------------------------------------------------------------------------

const server = app.listen(3000, () => {
	console.log(`Running on http://localhost:${server.address().port}`)
	open(`http://localhost:${server.address().port}`)
})

// Check for an update
fs.readdir('./', async (err, data) => {
    currentVer = '';
	if(err){
		return console.log(err);
	} 

	if(data.includes(`version.txt`)){
		currentVer = fs.readFileSync('./version.txt');
	} else {
		currentVer = 'old';
	}

	fetch('https://api.github.com/repos/AkinariHex/oTMD/releases') //ask for it
		.then((res) => res.json())
		.then((versiondata) => {	
		newVer = versiondata[0].tag_name;
			if(currentVer != newVer && currentVer < newVer){
				console.warn("You're using an older version of the displayer!\nCurrent version: " + currentVer + " / Latest version: " + newVer + "\nYou can still using this version but it's recommended to update to the latest version!\nOpen 'updater.exe' to update the displayer!")
			}
		})
})

// init socket server
const io = socket(server)

io.on('connection', (socket) => {
	// socket.on('event', async () => {
	// emit to sender
	// socket.emit('event', data)
	// emit to all
	// io.emit('event', data)
	// })

	socket.on('save', (data) => {
		fs.writeFileSync('./settings.json', JSON.stringify(data))
		io.emit('new_settings' /* data */)
	})
})
