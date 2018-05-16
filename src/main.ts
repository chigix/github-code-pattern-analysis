import * as Request from "request-promise-native";
import { Repository, RepositoryStatistic, Content, ErrorResponse } from "./interfaces";

const options: Request.RequestPromiseOptions = {
    headers: {
        "User-Agent": "Request-Promise"
    },
    json: true
};

const context = {
    githubId: "chigix",
    options: options,
    scanExtension: ["php", "java", "py", "ts", "js", "less"]
};

type Context = typeof context;

function scanContents(filepath: string, statistic: RepositoryStatistic) {
    return Request(filepath, context.options).then((contents: Content[]) => {
        const promises = [];
        contents.forEach(content => {
            if (content.type === "dir") {
                promises.push(scanContents(content.url, statistic));
                return;
            }
            for (let index = 0; index < context.scanExtension.length; index++) {
                if (content.download_url.endsWith("." + context.scanExtension[index])) {
                    console.log(content.download_url);
                    break;
                }
            }
        });
        return Promise.all(promises);
    }).catch((e) => {
        const errorResponse: ErrorResponse = e.response;
        if (!errorResponse || !errorResponse.headers) {
            console.log("NO HEADERS" + e);
            throw e;
        }
        if (errorResponse.headers["x-ratelimit-remaining"] === "0") {
            const sleep_time =
                parseInt(errorResponse.headers["x-ratelimit-reset"]) * 1000
                - (new Date()).getTime() + 180 * 1000;
            console.log("SLEEP TIME: " + sleep_time);
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    scanContents(filepath, statistic)
                        .then(resolve).catch(reject);
                }, sleep_time);
            });
        }
        throw "Unhandled Error Response" + e.message;
    });
}

Request(`https://api.github.com/users/${context.githubId}/repos`, context.options)
    .then((repositories) => {
        const repository_statistics: RepositoryStatistic[] = [];
        repositories.forEach((repository: Repository) => {
            if (repository.fork) {
                return;
            }
            repository_statistics.push({
                repository: repository,
                languageCounts: {},
                apiUrl: repository.url,
            });
        });
        return repository_statistics;
    }).then((statistics) => {
        const promises = [];
        statistics.forEach(statistic => {
            promises.push(scanContents(statistic.repository.contents_url.replace("{+path}", ""), statistic));
        });
        return Promise.all(promises).then(() => statistics);
    }).then((statistics) => {
        // console.log(statistics);
    }).catch((e) => {
        console.log("It seems that user profile fetch failed.");
        console.error(e);
    });
