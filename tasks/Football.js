const axios = require("axios");
const fs = require("fs");

function FootballTasks(){
    const getAllLeagues = () => {
        const options = {
            method: 'GET',
            url: `${process.env.API_FOOTBALL_URL}/leagues`,
            headers: {
                'X-RapidAPI-Key': `${process.env.API_FOOTBALL_KEY}`,
                'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
            }
        };

        axios.request(options).then(function (response) {
            let leagues = response.data
            console.log(response.data);
            fs.writeFile('./storage/leagues/all-leagues.json', JSON.stringify(leagues), (err) => {
                if (err) {
                    // throw err;
                    return({
                        status: 'error',
                        message: err.toString()
                    })
                }
                console.log("Appended to file")
                return({
                    status: "success",
                    message: leagues
                })
            });
        }).catch(function (error) {
            console.error(error);
        });
    }


    const yesterdayFixtures = () => {
        let today = new Date()
        let yesterday = new Date(today)
        let tomorrow = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        tomorrow.setDate(tomorrow.getDate() + 1)

        let year = today.getFullYear();
        tomorrow = tomorrow.toISOString().substring(0,tomorrow.toISOString().indexOf('T'));
        yesterday = yesterday.toISOString().substring(0,yesterday.toISOString().indexOf('T'));


        const options = {
            method: 'GET',
            url: 'https://api-football-v1.p.rapidapi.com/v3/fixtures',
            // params: {date: '2021-04-07'},
            params: {date: yesterday, timezone: "Africa/Lagos"},
            headers: {
                'X-RapidAPI-Key': '33f9653174mshefc4be967757e8ap144d7ejsn5a2eea54acd1',
                'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
            }
        };

        axios.request(options).then(function (response) {
            console.log(response.data);
            fs.writeFile('./storage/fixtures/yesterday-fixtures.json', JSON.stringify(response.data), (err) => {
                if (err) {
                    // throw err;
                    return({
                        status: 'error',
                        message: err.toString()
                    })
                }
                console.log("Appended to file")
                return({
                    status: "success",
                    message: response.data
                })
            });
        }).catch(function (error) {
            console.error(error);
        });
    }

    const todayFixtures = () => {
        let today = new Date()
        let yesterday = new Date(today)
        let tomorrow = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        tomorrow.setDate(tomorrow.getDate() + 1)

        let year = today.getFullYear();
        tomorrow = tomorrow.toISOString().substring(0,tomorrow.toISOString().indexOf('T'));
        today = today.toISOString().substring(0,today.toISOString().indexOf('T'));
        yesterday = yesterday.toISOString().substring(0,yesterday.toISOString().indexOf('T'));


        const options = {
            method: 'GET',
            url: 'https://api-football-v1.p.rapidapi.com/v3/fixtures',
            // params: {date: '2021-04-07'},
            params: {date: today, timezone: "Africa/Lagos"},
            headers: {
                'X-RapidAPI-Key': '33f9653174mshefc4be967757e8ap144d7ejsn5a2eea54acd1',
                'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
            }
        };

        axios.request(options).then(function (response) {
            console.log(Object.keys(response.data));
            let dataToSave = response.data
            // dataToSave.response.length=50 // change to vary number of fixtures fetched
            // dataToSave.results=50

            // Read odd and find fixtures that have odds. Those are the only fixtures we will fetch
            let fixturesInOdds = []

            fs.readFile('./storage/fixtures/today-odds.json', (err, data) => {
                if (err) res.send({
                    status: 'error',
                    message: err.toString()
                });

                let odds = JSON.parse(data)
                console.log(Object.keys(odds))
                // let idsInOdds = odds?.response?.fixture.map(a => a.id);
                let idsInOdds = odds?.response.map(a => a.fixture?.id)
                fixturesInOdds = idsInOdds

                // Read fixtures that have odds
                dataToSave.response = dataToSave?.response.filter(el => fixturesInOdds.includes(el.fixture?.id))
                dataToSave.results = dataToSave.response.length
                console.log({ dataToSave })
                fs.writeFile('./storage/fixtures/today-fixtures.json', JSON.stringify(dataToSave), (err) => {
                    if (err) {
                        // throw err;
                        return({
                            status: 'error',
                            message: err.toString()
                        })
                    }
                    console.log("Appended to file")
                    return({
                        status: "success",
                        message: response.data
                    })
                });

                console.log({ fixturesInOdds })
            })

            // console.log({ fixturesInOdds })

            // fs.writeFile('./storage/fixtures/today-fixtures.json', JSON.stringify(dataToSave), (err) => {
            //     if (err) {
            //         // throw err;
            //         return({
            //             status: 'error',
            //             message: err.toString()
            //         })
            //     }
            //     console.log("Appended to file")
            //     return({
            //         status: "success",
            //         message: response.data
            //     })
            // });
        }).catch(function (error) {
            console.error(error);
        });
    }


    const tomorrowFixtures = () => {
        let today = new Date()
        let yesterday = new Date(today)
        let tomorrow = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        tomorrow.setDate(tomorrow.getDate() + 1)

        let year = today.getFullYear();
        tomorrow = tomorrow.toISOString().substring(0,tomorrow.toISOString().indexOf('T'));
        today = today.toISOString().substring(0,today.toISOString().indexOf('T'));
        yesterday = yesterday.toISOString().substring(0,yesterday.toISOString().indexOf('T'));


        const options = {
            method: 'GET',
            url: 'https://api-football-v1.p.rapidapi.com/v3/fixtures',
            // params: {date: '2021-04-07'},
            params: {date: tomorrow, timezone: "Africa/Lagos"},
            headers: {
                'X-RapidAPI-Key': '33f9653174mshefc4be967757e8ap144d7ejsn5a2eea54acd1',
                'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
            }
        };

        axios.request(options).then(function (response) {
            console.log(response.data);
            fs.writeFile('./storage/fixtures/tomorrow-fixtures.json', JSON.stringify(response.data), (err) => {
                if (err) {
                    // throw err;
                    return({
                        status: 'error',
                        message: err.toString()
                    })
                }
                console.log("Appended to file")
                return({
                    status: "success",
                    message: response.data
                })
            });
        }).catch(function (error) {
            console.error(error);
        });
    }


    const timezones = () => {

        const options = {
            method: 'GET',
            url: 'https://api-football-v1.p.rapidapi.com/v3/timezone',
            headers: {
                'X-RapidAPI-Key': '33f9653174mshefc4be967757e8ap144d7ejsn5a2eea54acd1',
                'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
            }
        };

        axios.request(options).then(function (response) {
            console.log(response.data);
            fs.writeFile('./storage/fixtures/timezones.json', JSON.stringify(response.data), (err) => {
                if (err) {
                    // throw err;
                    return({
                        status: 'error',
                        message: err.toString()
                    })
                }
                console.log("Appended to file")
                return({
                    status: "success",
                    message: response.data
                })
            });
        }).catch(function (error) {
            console.error(error);
        });
    }

    const fetchTodayOdds = () => {
        let today = new Date()
        let yesterday = new Date(today)
        let tomorrow = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        tomorrow.setDate(tomorrow.getDate() + 1)

        let year = today.getFullYear();
        tomorrow = tomorrow.toISOString().substring(0,tomorrow.toISOString().indexOf('T'));
        today = today.toISOString().substring(0,today.toISOString().indexOf('T'));
        yesterday = yesterday.toISOString().substring(0,yesterday.toISOString().indexOf('T'));

        const options = {
            method: 'GET',
            url: 'https://api-football-v1.p.rapidapi.com/v3/odds',
            params: { date: today, bookmaker: 11, timezone: "Africa/Lagos" },
            headers: {
                'X-RapidAPI-Key': '33f9653174mshefc4be967757e8ap144d7ejsn5a2eea54acd1',
                'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
            }
        };

        axios.request(options).then(function (response) {
            console.log(response.data);
            fs.writeFile('./storage/fixtures/today-odds.json', JSON.stringify(response.data), (err) => {
                if (err) {
                    // throw err;
                    return({
                        status: 'error',
                        message: err.toString()
                    })
                }
                console.log("Appended to file")
                return({
                    status: "success",
                    message: response.data
                })
            });
        }).catch(function (error) {
            console.error(error);
        });
    }

    const fetchTomorrowOdds = () => {
        let today = new Date()
        let yesterday = new Date(today)
        let tomorrow = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        tomorrow.setDate(tomorrow.getDate() + 1)

        let year = today.getFullYear();
        tomorrow = tomorrow.toISOString().substring(0,tomorrow.toISOString().indexOf('T'));
        today = today.toISOString().substring(0,today.toISOString().indexOf('T'));
        yesterday = yesterday.toISOString().substring(0,yesterday.toISOString().indexOf('T'));

        const options = {
            method: 'GET',
            url: 'https://api-football-v1.p.rapidapi.com/v3/odds',
            params: { date: tomorrow, bookmaker: 11, timezone: "Africa/Lagos" },
            headers: {
                'X-RapidAPI-Key': '33f9653174mshefc4be967757e8ap144d7ejsn5a2eea54acd1',
                'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
            }
        };

        axios.request(options).then(function (response) {
            console.log(response.data);
            fs.writeFile('./storage/fixtures/tomorrow-odds.json', JSON.stringify(response.data), (err) => {
                if (err) {
                    // throw err;
                    return({
                        status: 'error',
                        message: err.toString()
                    })
                }
                console.log("Appended to file")
                return({
                    status: "success",
                    message: response.data
                })
            });
        }).catch(function (error) {
            console.error(error);
        });
    }

    const fetchBookmakers = () => {
        const options = {
            method: 'GET',
            url: 'https://api-football-v1.p.rapidapi.com/v3/odds/bookmakers',
            headers: {
                'X-RapidAPI-Key': '33f9653174mshefc4be967757e8ap144d7ejsn5a2eea54acd1',
                'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
            }
        };

        axios.request(options).then(function (response) {
            console.log(response.data);
            fs.writeFile('./storage/fixtures/bookmakers.json', JSON.stringify(response.data), (err) => {
                if (err) {
                    // throw err;
                    return({
                        status: 'error',
                        message: err.toString()
                    })
                }
                console.log("Appended to file")
                return({
                    status: "success",
                    message: response.data
                })
            });
        }).catch(function (error) {
            console.error(error);
        });
    }

    const fetchPredictions = () => {

        const options = {
            method: 'GET',
            url: 'https://api-football-v1.p.rapidapi.com/v3/predictions',
            params: {fixture: ''},
            headers: {
                'X-RapidAPI-Key': '33f9653174mshefc4be967757e8ap144d7ejsn5a2eea54acd1',
                'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
            }
        };


        fs.readFile('./storage/fixtures/today-fixtures.json', async (err, data) => {
            if (err) res.send({
                status: 'error',
                message: err.toString()
            });

            let fixtureIds = []

            let fixtures = JSON.parse(data)
            console.log(Object.keys(fixtures))
            // let idsInOdds = odds?.response?.fixture.map(a => a.id);
            fixtureIds = fixtures?.response.map(a => a.fixture?.id)

            let predictionsData = []

            // Fetch predictions for fixtures that have odds
            for (let i = 0; i < fixtureIds.length; i++) {
                options.params.fixture = `${fixtureIds[i]}`

                let pred = await axios.request(options)
                let response = pred?.data?.response[0]
                // console.log({response})

                predictionsData.push({
                    fixtureId: fixtureIds[i],
                    response: response
                })
            }

            console.log({ predictionsData })
            fs.writeFile('./storage/fixtures/today-predictions.json', JSON.stringify(predictionsData), (err) => {
                if (err) {
                    // throw err;
                    return({
                        status: 'error',
                        message: err.toString()
                    })
                }
                console.log("Appended to file")
                return({
                    status: "success",
                    message: predictionsData
                })
            });
        })
    }

    return { getAllLeagues, yesterdayFixtures, todayFixtures, tomorrowFixtures, timezones, fetchTodayOdds,
    fetchTomorrowOdds, fetchBookmakers, fetchPredictions }

}

module.exports = FootballTasks;
