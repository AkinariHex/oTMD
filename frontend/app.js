import countriesjs from './assets/countries'

const team1Element = document.querySelector('#team1')
const team2Element = document.querySelector('#team2')
const team1img = document.querySelector('.teaminner1')
const team2img = document.querySelector('.teaminner2')
const textzone = document.querySelector('#score')
const tourneyheadertext = document.querySelector('.tourney_info_top')
const tourneyfootertext = document.querySelector('.tourney_info_down')

const socket = io()

let osuapi = null
let matchid = null
let stage = null
let warmups = null
let reverse = null
let bestof = null
let matchtype = null
let userid = null

// invoke once on page opening
function init() {
	fetch('/settings')
		.then((res) => res.json())
		.then((data) => {
			osuapi = data.apikey
			matchid = data.matchid
			stage = data.stage
			warmups = data.warmups
			reverse = data.reverse
			bestof = data.bestof
			matchtype = data.matchtype
			userid = data.userid
			reverse = data.reverse
		})
}

init()

let osuinterval = setInterval(function () {
	checkData()
}, 15000)

socket.on('new_settings', (parsedData = data) => {
	// const parsedData = JSON.parse(data)
	// console.log(osuapi, matchid, stage, warmups, reverse, bestof, matchtype, userid)
	// console.log(parsedData)

	textzone.innerHTML = null

	// TODO: use destructuring
	osuapi = parsedData.apikey
	matchid = parsedData.matchid
	stage = parsedData.stage
	warmups = parsedData.warmups
	reverse = parsedData.reverse
	bestof = parsedData.bestof
	matchtype = parsedData.matchtype
	userid = parsedData.userid
	reverse = parsedData.reverse

	// console.log(osuapi, matchid, stage, warmups, reverse, bestof, matchtype, userid)
	checkData()
	// reload()
})

function checkData() {
	fetch('https://raw.githubusercontent.com/AkinariHex/oTMD/main/assets/tourneys.json')
		.then((res) => res.json())
		.then((tourneydata) => {
			if (osuapi != 'null' && matchid != 'null' && warmups != 'null' && reverse != 'null' && bestof != 'null' && stage != 'null' && matchtype != 'null') {
				if (userid != 'null' && matchtype == 'h1v1') {
					matchdatasolo(osuapi, matchid, warmups, osuinterval, bestof, tourneydata, stage, userid)
				} else if (matchtype == 'teamvs') {
					matchdata(osuapi, matchid, warmups, osuinterval, reverse, bestof, countriesjs, tourneydata, stage)
				} else {
					textzone.innerHTML = '<span style="color: #e45a5a; font-size: 15px">ERROR, USERID not found!</span>'
				}
			}
		})
}

function matchdata(api, mpid, warmups, interval, reverse, bestof, country, tournament, stage) {
	var team1score = 0
	var team2score = 0
	var team1 = 0
	var team2 = 0

	fetch(`https://osu.ppy.sh/api/get_match?k=${api}&mp=${mpid}`)
		.then((res) => res.json())
		.then((data) => {
			// console.log(data)
			for (var i = warmups; i < data.games.length; i++) {
				for (var x = 0; x < data.games[i].scores.length; x++) {
					var gameended = data.games[i].end_time == null
					if (gameended == false) {
						if (data.games[i].scores[x].team == '1') {
							team1score += parseInt(data.games[i].scores[x].score)
						} else if (data.games[i].scores[x].team == '2') {
							team2score += parseInt(data.games[i].scores[x].score)
						}
					}
				}
				if (team1score - team2score == 0) {
					team1 = team1
					team2 = team2
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
			var teamnames = data.match.name.match(patt)

			var team1name = `<span class="team_name">${teamnames[0].replace(/([()])/g, '')}</span>`
			var team2name = `<span class="team_name">${teamnames[1].replace(/([()])/g, '')}</span>`

			var tournamentindex = data.match.name.indexOf(':')
			var tournamentid = data.match.name.substring(0, tournamentindex)

			var tournament_info_name = ''

			// CHECK FOR TOURNAMENT
			if (tournament[tournamentid]) {
				tournament_info_name = tournament[tournamentid]
			}

			var team1pos = null
			var team2pos = null
			var team1imgstring = ''
			var team2imgstring = ''

			// CHECK FOR COUNTRIES FLAGS
			for (var z = 0; z < country.length; z++) {
				if (team1name.includes(country[z].country)) {
					team1pos = z
					team1imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/${country[team1pos].id}.png"> <br />`
				}
				if (team2name.includes(country[z].country)) {
					team2pos = z
					team2imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/${country[team2pos].id}.png"> <br />`
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
			tourneyheadertext.textContent = stage
			tourneyfootertext.textContent = tournament_info_name

			if (reverse == 'true' || reverse == true) {
				team1Element.textContent = team2
				team2Element.textContent = team1
				if (team1 == bestof / 2 + 0.5 || team2 == bestof / 2 + 0.5) {
					clearInterval(interval)
					team1img.innerHTML = ''
					team2img.innerHTML = ''
					tourneyheadertext.textContent = ''
					tourneyfootertext.textContent = ''
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
					tourneyheadertext.textContent = ''
					tourneyfootertext.textContent = ''
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
		})
		.catch((err) => {
			clearInterval(interval)
			console.error('Wrong setting(s)', err)
			tourneyheadertext.textContent = ''
			tourneyfootertext.textContent = ''
			textzone.innerHTML = '<span style="color: #e45a5a; font-size: 15px">ERROR, CHECK IF APIKEY, MATCHID, WARMUPS, REVERSE AND BESTOF ARE CORRECT</span>'
		})
}

function matchdatasolo(api, mpid, warmups, interval, bestof, tournament, stage, userid) {
	var team1score = 0
	var team2score = 0
	var team1 = 0
	var team2 = 0
	var team2id = ''

	var playerslot = ['0', '1']

	fetch(`https://osu.ppy.sh/api/get_match?k=${api}&mp=${mpid}`)
		.then((res) => res.json())
		.then((data) => {
			axios
				.get(`https://osu.ppy.sh/api/get_user?k=${api}&u=${userid}`)
				.then((dataplayer) => {
					for (var i = warmups; i < data.games.length; i++) {
						for (var x = 0; x < data.games[i].scores.length; x++) {
							var gameended = data.games[i].end_time == null
							if (gameended == false) {
								if (data.games[i].scores[x].user_id == dataplayer.data[0].user_id) {
									team1score += parseInt(data.games[i].scores[x].score)
								} else if (data.games[i].scores[x].user_id != userid && playerslot.includes(data.games[i].scores[x].slot)) {
									team2score += parseInt(data.games[i].scores[x].score)
									team2id = data.games[i].scores[x].user_id
								}
							}
						}
						if (team1score - team2score == 0) {
							team1 = team1
							team2 = team2
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
					var teamnames = data.match.name.match(patt)

					if (teamnames[0].replace(/([()])/g, '') == dataplayer.data[0].username) {
						var team1name = `<span class="team_name">${teamnames[0].replace(/([()])/g, '')}</span>`
						var team2name = `<span class="team_name">${teamnames[1].replace(/([()])/g, '')}</span>`
					} else {
						var team1name = `<span class="team_name">${teamnames[1].replace(/([()])/g, '')}</span>`
						var team2name = `<span class="team_name">${teamnames[0].replace(/([()])/g, '')}</span>`
					}

					var tournamentindex = data.match.name.indexOf(':')
					var tournamentid = data.match.name.substring(0, tournamentindex)

					var tournament_info_name = ''

					// CHECK FOR TOURNAMENT
					if (tournament[tournamentid]) {
						tournament_info_name = tournament[tournamentid]
					}

					var team1imgstring = ''
					var team2imgstring = ''

					// Player Image
					if (team1imgstring == '') {
						team1imgstring = `<img class="playerimg" src="http://s.ppy.sh/a/${dataplayer.data[0].user_id}"> <br />`
					}
					if (team2imgstring == '') {
						team2imgstring = `<img class="playerimg" src="http://s.ppy.sh/a/${team2id}"> <br />`
					}

					team1img.innerHTML = `${team1imgstring} ${team1name}`
					team2img.innerHTML = `${team2imgstring} ${team2name}`
					tourneyheadertext.textContent = stage
					tourneyfootertext.textContent = tournament_info_name

					team1Element.textContent = team1
					team2Element.textContent = team2
					if (team1 == bestof / 2 + 0.5 || team2 == bestof / 2 + 0.5) {
						clearInterval(interval)
						team1img.innerHTML = ''
						team2img.innerHTML = ''
						tourneyheadertext.textContent = ''
						tourneyfootertext.textContent = ''
						if (team1 == bestof / 2 + 0.5) {
							textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`
						} else {
							textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`
						}
					} else {
						team1Element.textContent = team1
						team2Element.textContent = team2
					}

					team1 = 0
					team2 = 0
				})
				.catch((err) => {
					clearInterval(interval)
					console.error('Wrong UserID', err)
					tourneyheadertext.textContent = ''
					tourneyfootertext.textContent = ''
					textzone.innerHTML = '<span style="color: #e45a5a; font-size: 15px">ERROR, USERID ERROR</span>'
				})
		})
		.catch((err) => {
			clearInterval(interval)
			console.error('Wrong setting(s)', err)
			tourneyheadertext.textContent = ''
			tourneyfootertext.textContent = ''
			textzone.innerHTML = '<span style="color: #e45a5a; font-size: 15px">ERROR, CHECK IF APIKEY, MATCHID, WARMUPS, REVERSE AND BESTOF ARE CORRECT</span>'
		})
}
