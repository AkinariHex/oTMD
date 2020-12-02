const express = require('express')
const cors = require('cors')
const fs = require('fs')
const open = require('open')
const path = require('path')
const bodyParser = require('body-parser')

const app = express()

// const eventEmitter = require('.eventEmitter')

app.use(express.json())
app.use(cors())

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/index.html'))
})

app.get('/style.css', function (req, res) {
	res.sendFile(path.join(__dirname, 'frontend/style.css'))
})

app.get('/assets/countries', function (req, res) {
	res.sendFile(path.join(__dirname, 'frontend/assets/countries.js'))
})

app.get('/app.js', cors(), function (req, res) {
	res.sendFile(path.join(__dirname, 'frontend/app.js'))
})

app.get('/settings', function (req, res) {
	try {
		let data = JSON.parse(fs.readFileSync('./settings.json'))
		res.json(data)
	} catch (error) {
		console.log('file settings.json not found, sending default settings')
		res.json(null)
	}
})

app.get('/visualizer', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer.html'))
})

app.post('/save', (req, res) => {
	console.log(req.body)
	fs.writeFileSync('./settings.json', JSON.stringify(req.body))
	res.sendStatus(200)
})

// app.use(bodyParser.json())
// app.use(bodyParser.urlencoded({ extended: false }))

// app.get('/getMatchData', eventEmitter)

const server = app.listen(7000, () => {
	console.log(`Running on http://localhost:${server.address().port}`)
	// open(`http://localhost:${server.address().port}`)
})
