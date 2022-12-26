

const fs = require('fs');
/**
 * LeaguesController
 */
class LeaguesController {
    /**
     * Example controller action.
     * @param {Http} http
     */
    async allLeagues(http) {
        try {
            const checkIfExist = fs.existsSync(`../storage/sports/leagues.json`);

            let file  = "[]";
            if (checkIfExist) {
                file = fs.readFileSync(`../storage/sports/leagues.json`);
            }

            file = JSON.parse(file);
            return http.send({
                status: "success",
                data: file
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }
}

module.exports = LeaguesController;
