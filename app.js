import countries from './countries';

const MAIN_LOOP_INTERVAL = 5000;
const MATCH_LOOP_INTERVAL = 20000;

const team1 = {
	score: document.getElementById('team1'),
	img: document.querySelector('.teaminner1')
};
const team2 = {
	score: document.getElementById('team2'),
	img: document.querySelector('.teaminner2')
};
const textzone = document.querySelector('#score');

let previousMatch = null;
let matchInterval = null;

async function main() {
	const { apiKey, matchId, warmups, reverse, bestOf } = await fetch('/settings').then(res => res.json());
	if (apiKey === undefined ||
		matchId === undefined ||
		warmups === undefined ||
		reverse === undefined ||
		bestOf === undefined)
		throw new Error('All fields must be present');
	if (previousMatch !== matchId) {
		if (matchInterval)
			clearInterval(matchInterval);
		previousMatch = matchId;
		await updateTeams(apiKey, matchId);
		await matchDataLoop(apiKey, matchId, warmups, reverse, bestOf);
	}	
	setTimeout(main, MAIN_LOOP_INTERVAL);
}
main();

const matchNameRegex = /\(([^()]+)\)/g;
async function updateTeams(apiKey, matchId) {
	const { match } = await fetch(`https://osu.ppy.sh/api/get_match?k=${apiKey}&mp=${matchId}`)
		.then(res => res.json());
	const [team1Name, team2Name] = [...match.name.matchAll(matchNameRegex)].map(([_, name]) => name);
	let team1Img = '<img class="countryimg" src="https://osu.ppy.sh/images/flags/A1.png"> <br />';
	let team2Img = '<img class="countryimg" src="https://osu.ppy.sh/images/flags/A2.png"> <br />';
	countries.forEach(({ country, id }) => {
		if (team1Name.includes(country))
			team1Img = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/${id}.png"> <br />`;
		if (team2Name.includes(country))
			team2Img = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/${id}.png"> <br />`;
	});
	team1.img.innerHTML = `${team1Img} ${team1Name}`;
	team2.img.innerHTML = `${team2Img} ${team2Name}`;
}

async function matchDataLoop(apiKey, matchId, warmups, reverse, bestOf) {
	matchInterval = setInterval(() => matchData(apiKey, matchId, warmups, reverse, bestOf), MATCH_LOOP_INTERVAL);
	await matchData(apiKey, matchId, warmups, reverse, bestOf);
}

async function matchData(apiKey, matchId, warmups, reverse, bestOf) {
	const { match, games } = await fetch(`https://osu.ppy.sh/api/get_match?k=${apiKey}&mp=${matchId}`)
		.then(res => res.json());
	const finished = !!match.end_time;
	// ? We might not want reduce here as it can impact the performance
	const [team1Score, team2Score] = games.slice(warmups).reduce((acc, { scores }) => {
		const [a, b] = scores.reduce((acc, { team, score }) => {
			acc[parseInt(team) - 1] += BigInt(score);
			return acc;
		}, [0n, 0n]);
		if (a > b)
			acc[0] += 1;
		else if (b > a)
			acc[1] += 1;
		return acc;
	}, [0, 0]);
	team1.score.innerText = team1Score;
	team2.score.innerText = team2Score;
	const maxScore = (bestOf + 1) / 2;
	if ((team1Score === maxScore || team2Score === maxScore || finished) && matchInterval) {
		if (team1Score > team2Score)
			textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1.img.innerHTML} wins!</span>`;
		else
			textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2.img.innerHTML} wins!</span>`;
		team1.img.style.display = 'none';
		team2.img.style.display = 'none';
		console.log('Cleared matchInterval');
		clearInterval(matchInterval);
		matchInterval = null;
	}
}