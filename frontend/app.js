import countriesjs from './assets/countries'
import * as scoremodification from './assets/scoremodification'

const visualizer = document.querySelector('.visualizer');
const team1Element = document.querySelector('#team1')
const team2Element = document.querySelector('#team2')
const team1img = document.querySelector('.teaminner1')
const team2img = document.querySelector('.teaminner2')
const textzone = document.querySelector('#score')
const tourneyheadertext = document.querySelector('.tourney_info_top')
const tourneyfootertext = document.querySelector('.tourney_info_down')
const visualizer_content = document.querySelector('.v_content')

const socket = io()

let osuapi = null
let matchid = null
let stage = null
let maps = null
let warmups = null
let reverse = null
let bestof = null
let matchtype = null
let userid = null
let visualizerborder = null

// invoke once on page opening
function init() {
	fetch('/settings')
		.then((res) => res.json())
		.then((data) => {
			console.log('first loading', data)

			osuapi = data.apikey
			matchid = data.matchid
			stage = data.stage
			maps = data.nofmaps
			warmups = data.warmups
			reverse = data.reverse
			bestof = data.bestof
			matchtype = data.matchtype
			userid = data.userid
			reverse = data.reverse
			visualizerborder = data.visualizerstyle

			checkData()
		})
}

init()

let osuinterval = setInterval(function () {
	checkData()
}, 15000)

socket.on('new_settings', (/* parsedData = data */) => {
	// const parsedData = JSON.parse(data)
	// console.log(osuapi, matchid, stage, warmups, reverse, bestof, matchtype, userid)
	// console.log('new data', parsedData)

	// textzone.innerHTML = null

	// TODO: use destructuring
	// osuapi = parsedData.apikey
	// matchid = parsedData.matchid
	// stage = parsedData.stage
	// warmups = parsedData.warmups
	// reverse = parsedData.reverse
	// bestof = parsedData.bestof
	// matchtype = parsedData.matchtype
	// userid = parsedData.userid
	// reverse = parsedData.reverse

	// console.log(osuapi, matchid, stage, warmups, reverse, bestof, matchtype, userid)
	// checkData()

	// just gave in :)
	location.reload()
})

function checkData() {
	fetch('https://raw.githubusercontent.com/AkinariHex/oTMD/main/frontend/assets/tourneys.json')
		.then((res) => res.json())
		.then((tourneydata) => {
			visualizer.style.setProperty('--visualizer-border-radius', visualizerborder);
			if (osuapi != 'null' && matchid != 'null' && warmups != 'null' && reverse != 'null' && bestof != 'null' && stage != 'null' && matchtype != 'null') {
				if (userid != 'null' && matchtype == 'h1v1') {
					console.log(stage)
					if(stage == 'Qualifiers') {	
						matchdatasoloQualifiers(osuapi, matchid, warmups, osuinterval, tourneydata, stage, userid, maps)
					} else {
						matchdatasolo(osuapi, matchid, warmups, osuinterval, bestof, tourneydata, stage, userid)
					}
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

			// Tournament Info
			var tournamentindex = data.match.name.indexOf(':');
			var tournamentid = data.match.name.substring(0, tournamentindex);
		
			var tournament_info_name = '';
			var tournament_modifiers = {"HD": {"type": "*", "value": "1.00"}, "HR": {"type": "*", "value": "1.00"}, "EZ": {"type": "*", "value": "1.00"}, "FL": {"type": "*", "value": "1.00"}};
		
			// CHECK FOR TOURNAMENT
			if(tournament[tournamentid]){
			  tournament_info_name = tournament[tournamentid].name;
			  tournament_modifiers = tournament[tournamentid].modifiers;
			}

			
			// Check for ADV in grandfinals
			if(scoremodification.winnersBracketADV(stage, tournament_modifiers) != null){
				team1 += scoremodification.winnersBracketADV(stage, tournament_modifiers)
			}			
		
			//Score system
			for(var i=warmups; i<data.games.length; i++){
				for(var x=0; x<data.games[i].scores.length; x++){
				  var gameended = data.games[i].end_time==null;
				  if(gameended == false ){
					if(data.games[i].scores[x].team == '1'){
					  if(data.games[i].mods == 0) {// 0 = FREEMOD - !0 = MODLOCKED
						team1score+=scoremodification.modsModifiers(data.games[i].scores[x].enabled_mods, parseInt(data.games[i].scores[x].score), tournament_modifiers)
					  }
					  else {
						team1score+=scoremodification.modsModifiers(data.games[i].mods, parseInt(data.games[i].scores[x].score), tournament_modifiers)
					  }
					} else if(data.games[i].scores[x].team == '2'){
					  if(data.games[i].mods == 0) {// 0 = FREEMOD - !0 = MODLOCKED
						team2score+=scoremodification.modsModifiers(data.games[i].scores[x].enabled_mods, parseInt(data.games[i].scores[x].score), tournament_modifiers)
					  }
					  else {
						team2score+=scoremodification.modsModifiers(data.games[i].mods, parseInt(data.games[i].scores[x].score), tournament_modifiers)
					  }
					}
				  }
				}
		
			  if(team1score - team2score == 0){
				team1 = team1;
				team2 = team2;
			  } else if(team1score - team2score > 0){
				  team1++;
				  team1score = 0;
				  team2score = 0;
			  } else {
				  team2++;
				  team1score = 0;
				  team2score = 0;
			  }
			}
			var patt = /\((.*?)\)/g;
			var teamnames = data.match.name.match(patt);

			var team1nameNoSpan = teamnames[0].replace(/([()])/g, "");
			var team2nameNoSpan = teamnames[1].replace(/([()])/g, "");

			
			var team1name = `<span class="team_name">${teamnames[0].replace(/([()])/g, "")}</span>`;
			var team2name = `<span class="team_name">${teamnames[1].replace(/([()])/g, "")}</span>`;
		
			var team1pos = null;
			var team2pos = null;
			var team1imgstring = '';
			var team2imgstring = '';

		
			
			var team1nospace = team1nameNoSpan.replace(/\s/g,'');
    		var team2nospace = team2nameNoSpan.replace(/\s/g,'');
			fetch(`/teams`)
				.then((res) => res.json())
				.then((data) => {
					// CHECK FOR COUNTRIES FLAGS
					for(var z=0; z<country.length; z++){
						if(team1name.includes(country[z].country)){
							team1pos = z;
							team1imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/${country[team1pos].id}.png"> <br />`;
						}
						if(team2name.includes(country[z].country)){
							team2pos = z;
							team2imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/${country[team2pos].id}.png"> <br />`;
						}
					}
					// CHECK FOR TEAMS IMAGE
					data.forEach(image => {
						console.log(image.includes(team1nospace.toLowerCase()));
						if(image.includes(team1nospace.toLowerCase())){
							team1imgstring = `<img class="teamimg" src="/teamsimg/${image}"> <br />`;
						}
						if(image.includes(team2nospace.toLowerCase())){
							team2imgstring = `<img class="teamimg" src="/teamsimg/${image}"> <br />`;
						}
					});
					// CHECK IF FOUND THE FLAG AND REPLACE THE BLANK IMAGE WITH A BLANK FLAG
			if(team1imgstring == ''){
				team1imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/A1.png"> <br />`;
			  }
			  if(team2imgstring == ''){
				team2imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/A2.png"> <br />`;
			  }
		  
			  team1img.innerHTML = `${team1imgstring} ${team1name}`;
			  team2img.innerHTML = `${team2imgstring} ${team2name}`;
			  tourneyheadertext.innerHTML = stage + "<br />BO" + bestof;
			  tourneyfootertext.textContent = tournament_info_name;
		  
		  
		  
			  if(reverse == 'true' || reverse == true){
				team1Element.textContent = team2;
				team2Element.textContent = team1;
				if(team1 == (bestof/2)+0.5 || team2 == (bestof/2)+0.5){
				  clearInterval(interval);
				  team1img.innerHTML = '';
				  team2img.innerHTML = '';
				  tourneyheadertext.textContent = '';
				  tourneyfootertext.textContent = '';        
				  if(team1 == (bestof/2)+0.5){
					textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`;
				  } else {
					textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`;
				  }
				} else {
				  team1Element.textContent = team2;
				  team2Element.textContent = team1;
				}
			  } else {
				team1Element.textContent = team1;
				team2Element.textContent = team2;
				if(team1 == (bestof/2)+0.5 || team2 == (bestof/2)+0.5){
				  clearInterval(interval);
				  team1img.innerHTML = '';
				  team2img.innerHTML = '';
				  tourneyheadertext.textContent = '';
				  tourneyfootertext.textContent = '';  
				  if(team1 == (bestof/2)+0.5){
					textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`;
				  } else {
					textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`;
				  }
				} else {
				  team1Element.textContent = team1;
				  team2Element.textContent = team2;
				}
			  }
		  
			  
		  
			  team1 = 0;
			  team2 = 0;

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
					//Tournament Info
					var tournamentindex = data.match.name.indexOf(':');
					var tournamentid = data.match.name.substring(0, tournamentindex);

					var tournament_info_name = '';
					var tournament_modifiers = {"HD": "1.00","HR": "1.00","EZ": "1.00","FL": "1.00"};

					// CHECK FOR TOURNAMENT
					if(tournament[tournamentid]){
					tournament_info_name = tournament[tournamentid].name;
					tournament_modifiers = tournament[tournamentid].modifiers;
					}

					//Score system
					for(var i=warmups; i<data.games.length; i++){
						for(var x=0; x<data.games[i].scores.length; x++){
						  var gameended = data.games[i].end_time==null;
						  if(gameended == false ){
							if(data.games[i].scores[x].user_id == dataplayer.data[0].user_id){
							  if(data.games[i].mods == 0) {// 0 = FREEMOD - !0 = MODLOCKED
								team1score+=scoremodification.modsModifiers(data.games[i].scores[x].enabled_mods, parseInt(data.games[i].scores[x].score), tournament_modifiers)
							  }
							  else {
								team1score+=scoremodification.modsModifiers(data.games[i].mods, parseInt(data.games[i].scores[x].score), tournament_modifiers)
							  }
							} else if(data.games[i].scores[x].user_id != userid && playerslot.includes(data.games[i].scores[x].slot)){
							  if(data.games[i].mods == 0) {// 0 = FREEMOD - !0 = MODLOCKED
								team2score+=scoremodification.modsModifiers(data.games[i].scores[x].enabled_mods, parseInt(data.games[i].scores[x].score), tournament_modifiers)
								team2id = data.games[i].scores[x].user_id;
							  }
							  else {
								team2score+=scoremodification.modsModifiers(data.games[i].mods, parseInt(data.games[i].scores[x].score), tournament_modifiers)
								team2id = data.games[i].scores[x].user_id;
							  }
							}
						  } 
						}
					  if(team1score - team2score == 0){
						team1 = team1;
						team2 = team2;
					  } else if(team1score - team2score > 0){
						  team1++;
						  team1score = 0;
						  team2score = 0;
					  } else {
						  team2++;
						  team1score = 0;
						  team2score = 0;
					  }
					}
					var patt = /\((.*?)\)/g;
					var teamnames = data.match.name.match(patt);

					if(teamnames[0].replace(/([()])/g, "") == dataplayer.data[0].username){
						var team1name = `<span class="team_name">${teamnames[0].replace(/([()])/g, "")}</span>`;
						var team2name = `<span class="team_name">${teamnames[1].replace(/([()])/g, "")}</span>`;
					  } else {
						var team1name = `<span class="team_name">${teamnames[1].replace(/([()])/g, "")}</span>`;
						var team2name = `<span class="team_name">${teamnames[0].replace(/([()])/g, "")}</span>`;
					  }
				  
				  
					  var team1imgstring = '';
					  var team2imgstring = '';
				  
				  
					  // Player Image
					  if(team1imgstring == ''){
						team1imgstring = `<img class="playerimg" src="http://s.ppy.sh/a/${dataplayer.data[0].user_id}"> <br />`;
					  }
					  if(team2imgstring == ''){
						team2imgstring = `<img class="playerimg" src="http://s.ppy.sh/a/${team2id}"> <br />`;
					  }
				  
					  team1img.innerHTML = `${team1imgstring} ${team1name}`;
					  team2img.innerHTML = `${team2imgstring} ${team2name}`;
					  tourneyheadertext.textContent = stage;
					  tourneyfootertext.textContent = tournament_info_name;
				  
				  
				  
					
						team1Element.textContent = team1;
						team2Element.textContent = team2;
						if(team1 == (bestof/2)+0.5 || team2 == (bestof/2)+0.5){
						  clearInterval(interval);
						  team1img.innerHTML = '';
						  team2img.innerHTML = '';
						  tourneyheadertext.textContent = '';
						  tourneyfootertext.textContent = '';  
						  if(team1 == (bestof/2)+0.5){
							textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`;
						  } else {
							textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`;
						  }
						} else {
						  team1Element.textContent = team1;
						  team2Element.textContent = team2;
						}
					  
				  
					  
				  
					  team1 = 0;
					  team2 = 0;
				  
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

function matchdatasoloQualifiers(api, mpid, warmups, interval, tournament, stage, userid, maps) {

	function getNumberWithCommas(number) {
		return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	}

	const team_Q_propic = document.querySelector('.team_Q_propic')
	const team_Q_name = document.querySelector('.team_Q_name')
	const numberMaps_number = document.querySelector('#numberMaps_number')
	const mapsLeft = document.querySelector('.mapsLeft')
	const QualifiersData_Scores_Table = document.querySelector('#QualifiersData_Scores_Table')
	const QualifiersData_Total = document.querySelector('.QualifiersData_Total')

	const MapsToPlay = maps;

	var team1Scores = []
	var team1score = 0
	//var team2score = 0
	var team1 = '000.000'
	//var team2 = 0
	//var team2id = ''

	var playerslot = ['0', '1']

	fetch(`https://osu.ppy.sh/api/get_match?k=${api}&mp=${mpid}`)
		.then((res) => res.json())
		.then((data) => {
			axios
				.get(`https://osu.ppy.sh/api/get_user?k=${api}&u=${userid}`)
				.then((dataplayer) => {
					//Tournament Info
					var tournamentindex = data.match.name.indexOf(':');
					var tournamentid = data.match.name.substring(0, tournamentindex);

					var tournament_info_name = '';
					var tournament_modifiers = {"HD": "1.00","HR": "1.00","EZ": "1.00","FL": "1.00"};

					// CHECK FOR TOURNAMENT
					if(tournament[tournamentid]){
					tournament_info_name = tournament[tournamentid].name;
					tournament_modifiers = tournament[tournamentid].modifiers;
					}

					//Score system
					for(var i=warmups; i<data.games.length; i++){
						for(var x=0; x<data.games[i].scores.length; x++){
						  var gameended = data.games[i].end_time==null;
						  if(gameended == false ){
							if(data.games[i].scores[x].user_id == dataplayer.data[0].user_id){
							  if(data.games[i].mods == 0) {// 0 = FREEMOD - !0 = MODLOCKED
								var scoreToAdd = scoremodification.modsModifiers(data.games[i].scores[x].enabled_mods, parseInt(data.games[i].scores[x].score), tournament_modifiers)
								team1score+=scoreToAdd
								let modsToAdd = scoremodification.modsModifiersQualifiers(data.games[i].scores[x].enabled_mods);
								team1Scores[i] = {score: scoreToAdd, mods: modsToAdd}
							}
							  else {
								var scoreToAdd = scoremodification.modsModifiers(data.games[i].mods, parseInt(data.games[i].scores[x].score), tournament_modifiers)
								team1score+=scoreToAdd
								let modsToAdd = scoremodification.modsModifiersQualifiers(data.games[i].mods);
								team1Scores[i] = {score: scoreToAdd, mods: modsToAdd}
							  }
							}
						  } 
						}
					}

					team1Scores.forEach((score) => {
						QualifiersData_Scores_Table.innerHTML += `
								<tr>
									<td>
									${score.mods}
									</td>
									<td>${getNumberWithCommas(score.score)}</td>
								</tr>
								`
					})

					team_Q_propic.style.backgroundImage = `url(http://s.ppy.sh/a/${dataplayer.data[0].user_id})`
					team_Q_name.innerHTML = `${dataplayer.data[0].username}`
					if(!team1Scores.length+1 > MapsToPlay){
						numberMaps_number.innerHTML = `${team1Scores.length+1}/${MapsToPlay}`
					} else {
						numberMaps_number.innerHTML = `${team1Scores.length}/${MapsToPlay}`
					}
					mapsLeft.innerHTML = `${MapsToPlay - team1Scores.length} maps left`
					QualifiersData_Total.innerHTML = `${getNumberWithCommas(team1score)}`
				  
					tourneyheadertext.textContent = stage;
					tourneyfootertext.textContent = tournament_info_name;
				  
					if(team1Scores.length == MapsToPlay){
						  clearInterval(interval);
						  numberMaps_number.innerHTML = `${team1Scores.length}/${MapsToPlay}`
						  mapsLeft.innerHTML = 'Qualifiers Done!'
					}
				  
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