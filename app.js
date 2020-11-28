const team1Element = document.querySelector('#team1');
const team2Element = document.querySelector('#team2');
const team1img = document.querySelector('.teaminner1');
const team2img = document.querySelector('.teaminner2');
const textzone = document.querySelector('#score');
const tourneyheadertext = document.querySelector('.tourney_info_top');
const tourneyfootertext = document.querySelector('.tourney_info_down');

import countriesjs from './assets/countries';

var oldmatchid = '';

getjson();
var jsoninterval = setInterval(function(){getjson()}, 5000);

function getjson(){
  axios.get('/settings').then((settingsdata)=>{

    var osuapi = settingsdata.data.apikey;
    var matchid = settingsdata.data.matchid;
    var stage = settingsdata.data.stage;
    var warmups = settingsdata.data.warmups;
    var reverse = settingsdata.data.reverse;
    var bestof = settingsdata.data.bestof;
    var matchtype = settingsdata.data.matchtype;
    var userid = settingsdata.data.userid;

    if(oldmatchid != matchid){
      oldmatchid = matchid;
      axios.get('https://raw.githubusercontent.com/AkinariHex/oTMD/main/assets/tourneys.json').then((tourneydata)=>{
        var tourneyd = tourneydata.data;

        if(osuapi != 'null' && matchid != 'null' && warmups != 'null' && reverse != 'null' && bestof != 'null' && stage != 'null' && matchtype != 'null'){
          if (userid != 'null' && matchtype == 'h1v1'){
            matchdatasolo(osuapi, matchid, warmups, osuinterval, bestof, tourneyd, stage, userid)
            var osuinterval = setInterval(function(){matchdatasolo(osuapi, matchid, warmups, osuinterval, bestof, tourneyd, stage, userid)}, 15000);
          } else if (matchtype == 'teamvs'){
            matchdata(osuapi, matchid, warmups, osuinterval, reverse, bestof, countriesjs, tourneyd, stage);
            var osuinterval = setInterval(function(){matchdata(osuapi, matchid, warmups, osuinterval, reverse, bestof, countriesjs, tourneyd, stage)}, 15000);
          } else {
            textzone.innerHTML = '<span style="color: #e45a5a; font-size: 15px">ERROR, USERID not found!</span>';
          }
        }

      })
      
    }
  })
}




function matchdata(api, mpid, warmups, interval, reverse, bestof, country, tournament, stage) {
  var team1score = 0;
  var team2score = 0;
  var team1 = 0;
  var team2 = 0;
  axios.get(`https://osu.ppy.sh/api/get_match?k=${api}&mp=${mpid}`).then(data => {
    for(var i=warmups; i<data.data.games.length; i++){
        for(var x=0; x<data.data.games[i].scores.length; x++){
          var gameended = data.data.games[i].end_time==null;
          if(gameended == false ){
            if(data.data.games[i].scores[x].team == '1'){
              team1score+=parseInt(data.data.games[i].scores[x].score);
            } else if(data.data.games[i].scores[x].team == '2'){
                team2score+=parseInt(data.data.games[i].scores[x].score);
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
    var teamnames = data.data.match.name.match(patt);
    
    var team1name = `<span class="team_name">${teamnames[0].replace(/([()])/g, "")}</span>`;
    var team2name = `<span class="team_name">${teamnames[1].replace(/([()])/g, "")}</span>`;

    var tournamentindex = data.data.match.name.indexOf(':');
    var tournamentid = data.data.match.name.substring(0, tournamentindex);

    var tournament_info_name = '';

    // CHECK FOR TOURNAMENT
    if(tournament[tournamentid]){
      tournament_info_name = tournament[tournamentid];
    }

    var team1pos = null;
    var team2pos = null;
    var team1imgstring = '';
    var team2imgstring = '';

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

    // CHECK IF FOUND THE FLAG AND REPLACE THE BLANK IMAGE WITH A BLANK FLAG
    if(team1imgstring == ''){
      team1imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/A1.png"> <br />`;
    }
    if(team2imgstring == ''){
      team2imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/A2.png"> <br />`;
    }

    team1img.innerHTML = `${team1imgstring} ${team1name}`;
    team2img.innerHTML = `${team2imgstring} ${team2name}`;
    tourneyheadertext.textContent = stage;
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

  }).catch(err => {
    clearInterval(interval);
    console.log(err);
    console.log('API errata');
    tourneyheadertext.textContent = "";
    tourneyfootertext.textContent = "";
    textzone.innerHTML = '<span style="color: #e45a5a; font-size: 15px">ERROR, CHECK IF APIKEY, MATCHID, WARMUPS, REVERSE AND BESTOF ARE CORRECT</span>';
  })
}


function matchdatasolo(api, mpid, warmups, interval, bestof, tournament, stage, userid) {
  var team1score = 0;
  var team2score = 0;
  var team1 = 0;
  var team2 = 0;
  var team2id = '';


  var playerslot = ['0', '1'];

  axios.get(`https://osu.ppy.sh/api/get_match?k=${api}&mp=${mpid}`).then(data => {

    axios.get(`https://osu.ppy.sh/api/get_user?k=${api}&u=${userid}`).then(dataplayer => {
    
    for(var i=warmups; i<data.data.games.length; i++){
        for(var x=0; x<data.data.games[i].scores.length; x++){
          var gameended = data.data.games[i].end_time==null;
          if(gameended == false ){
            if(data.data.games[i].scores[x].user_id == dataplayer.data[0].user_id){
              team1score+=parseInt(data.data.games[i].scores[x].score);
            } else if(data.data.games[i].scores[x].user_id != userid && playerslot.includes(data.data.games[i].scores[x].slot)){
                team2score+=parseInt(data.data.games[i].scores[x].score);
                team2id = data.data.games[i].scores[x].user_id;
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
    var teamnames = data.data.match.name.match(patt);

    
    if(teamnames[0].replace(/([()])/g, "") == dataplayer.data[0].username){
      var team1name = `<span class="team_name">${teamnames[0].replace(/([()])/g, "")}</span>`;
      var team2name = `<span class="team_name">${teamnames[1].replace(/([()])/g, "")}</span>`;
    } else {
      var team1name = `<span class="team_name">${teamnames[1].replace(/([()])/g, "")}</span>`;
      var team2name = `<span class="team_name">${teamnames[0].replace(/([()])/g, "")}</span>`;
    }

    var tournamentindex = data.data.match.name.indexOf(':');
    var tournamentid = data.data.match.name.substring(0, tournamentindex);

    var tournament_info_name = '';

    // CHECK FOR TOURNAMENT
      if(tournament[tournamentid]){
          tournament_info_name = tournament[tournamentid];
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


  }).catch(err => {
    clearInterval(interval);
    console.log(err);
    console.log('UserID errato');
    tourneyheadertext.textContent = "";
    tourneyfootertext.textContent = "";
    textzone.innerHTML = '<span style="color: #e45a5a; font-size: 15px">ERROR, USERID ERROR</span>';
  })

  }).catch(err => {
    clearInterval(interval);
    console.log(err);
    console.log('API errata');
    tourneyheadertext.textContent = "";
    tourneyfootertext.textContent = "";
    textzone.innerHTML = '<span style="color: #e45a5a; font-size: 15px">ERROR, CHECK IF APIKEY, MATCHID, WARMUPS, REVERSE AND BESTOF ARE CORRECT</span>';
  })
}

