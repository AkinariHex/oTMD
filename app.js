import countries from './countries'

const team1Element = document.querySelector('#team1')
const team2Element = document.querySelector('#team2')
const team1img = document.querySelector('.teaminner1')
const team2img = document.querySelector('.teaminner2')
const textzone = document.querySelector('#score')

var oldmatchid = null

getjson()
var jsoninterval = setInterval(function () {
	getjson()
}, 5000)

function getjson() {
	fetch('/settings')
		.then((res) => res.json())
		.then((settingsdata) => {
			let { apikey, matchid, warmups, reverse, bestof } = settingsdata

			if (oldmatchid != matchid) {
				oldmatchid = matchid
				if (apikey && matchid && warmups && reverse && bestof) {
					matchdata(apikey, matchid, warmups, osuinterval, reverse, bestof)
					var osuinterval = setInterval(function () {
						matchdata(apikey, matchid, warmups, osuinterval, reverse, bestof)
					}, 20000)
				}
			}
		})
}

function matchdata(api, mpid, warmups, interval, reverse, bestof) {
	var team1score = 0
	var team2score = 0
	var team1 = 0
	var team2 = 0
	fetch(`https://osu.ppy.sh/api/get_match?k=${api}&mp=${mpid}`)
		.then((res) => res.json())
		.then((data) => {
			console.log(data.data)
			for (var i = warmups; i < data.data.games.length; i++) {
				for (var x = 0; x < data.data.games[i].scores.length; x++) {
					var gameended = data.data.games[i].end_time == null
					if (gameended == false) {
						if (data.data.games[i].scores[x].team == '1') {
							team1score += parseInt(data.data.games[i].scores[x].score)
						} else if (data.data.games[i].scores[x].team == '2') {
							team2score += parseInt(data.data.games[i].scores[x].score)
						}
					} else {
						return
					}
				}
				if (team1score - team2score == 0) {
					return
				} else if (team1score - team2score > 0) {
					team1++
					team1score = 0
					team2score = 0
				} else {
					team2++
					team1score = 0
					team2score = 0
				}
			}
			var patt = /\((.*?)\)/g
			var teamnames = data.data.match.name.match(patt)
			console.log(`${teamnames[0]} ${team1} - ${team2} ${teamnames[1]}`)

			var team1name = teamnames[0].replace(/([()])/g, '')
			var team2name = teamnames[1].replace(/([()])/g, '')
			var team1pos = null
			var team2pos = null
			var team1imgstring = ''
			var team2imgstring = ''

			// CHECK FOR COUNTRIES FLAGS
			for (var z = 0; z < countries.length; z++) {
				if (team1name.includes(countries[z].country)) {
					team1pos = z
					team1imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/${countries[team1pos].id}.png"> <br />`
				}
				if (team2name.includes(countries[z].country)) {
					team2pos = z
					team2imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/${countries[team2pos].id}.png"> <br />`
				}
			}

			// CHECK IF FOUND THE FLAG AND REPLACE THE BLANK IMAGE WITH A BLANK FLAG
			if (team1imgstring == '') {
				team1imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/A1.png"> <br />`
			}
			if (team2imgstring == '') {
				team2imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/A2.png"> <br />`
			}

			team1img.innerHTML = `${team1imgstring} ${team1name}`
			team2img.innerHTML = `${team2imgstring} ${team2name}`

			if (reverse == 'true' || reverse == true) {
				team1Element.textContent = team2
				team2Element.textContent = team1
				if (team1 == bestof / 2 + 0.5 || team2 == bestof / 2 + 0.5) {
					clearInterval(interval)
					team1img.innerHTML = ''
					team2img.innerHTML = ''
					if (team1 == bestof / 2 + 0.5) {
						textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`
					} else {
						textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`
					}
				} else {
					team1Element.textContent = team2
					team2Element.textContent = team1
				}
			} else {
				team1Element.textContent = team1
				team2Element.textContent = team2
				if (team1 == bestof / 2 + 0.5 || team2 == bestof / 2 + 0.5) {
					clearInterval(interval)
					team1img.innerHTML = ''
					team2img.innerHTML = ''
					if (team1 == bestof / 2 + 0.5) {
						textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`
					} else {
						textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`
					}
				} else {
					team1Element.textContent = team1
					team2Element.textContent = team2
				}
			}

			team1 = 0
			team2 = 0

			console.log('fine')
		})
		.catch((err) => {
			clearInterval(interval)
			console.error('Wrong API Key', err)
			textzone.innerHTML = '<span style="color: #e45a5a; font-size: 15px">ERROR, CHECK IF APIKEY, MATCHID, WARMUPS, REVERSE AND BESTOF ARE CORRECT</span>'
		})
}
