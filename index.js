const express = require('express')
const cors = require('cors')
const fs = require('fs')
const open = require('open')
const path = require('path')

const app = express()

// app.use(express.static('public'))
app.use(express.json())
app.use(cors())

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'index.html'))
})

app.get('/style.css', function (req, res) {
	res.sendFile(path.join(__dirname, 'style.css'))
})

app.get('/assets/countries', function (req, res) {
	res.sendFile(path.join(__dirname, 'assets/countries.js'))
})

app.get('/app.js', cors(), function (req, res) {
	res.sendFile(path.join(__dirname, 'app.js'))
})

app.get('/assets/countries', function (req, res) {
	res.sendFile(path.join(__dirname, 'assets/countries.js'))
})

app.get('/settings', function (req, res) {
	let data = JSON.parse(fs.readFileSync('./settings.json'))
	res.json(data)
})

app.get('/visualizer', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'visualizer.html'))
})

app.post('/save', (req, res) => {
	console.log(req.body)
	fs.writeFileSync('./settings.json', JSON.stringify(req.body))
	res.sendStatus(200)
})

const server = app.listen(3000, () => {
	console.log(`Running on http://localhost:${server.address().port}`)
	open(`http://localhost:${server.address().port}`)
})
