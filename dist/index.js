"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const debug = require("debug");
const fs_1 = require("fs");
const jsdom_1 = require("jsdom");
const path_1 = require("path");
const superagent_1 = require("superagent");
const interfaces_1 = require("./interfaces");
const MAX_SOURCE_SIZE = 16 * 1024 * 1024;
const UPDATE_INTERVAL = 2000;
const configPath = path_1.join(__dirname, "..", "config.json");
const config = JSON.parse(fs_1.readFileSync(configPath).toString());
const agent = superagent_1.agent();
const log = debug("perilla:judger:plugin:atcoder");
const isLoggedIn = async () => {
    const result = await agent.get("https://atcoder.jp/settings");
    return !result.redirects.length;
};
const initRequest = async () => {
    log("Login");
    const loginPage = await agent
        .get("https://atcoder.jp/login")
        .set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36");
    const dom = new jsdom_1.JSDOM(loginPage.text);
    const token = dom.window.document.querySelector('#main-container > div.row > div > form > input[type="hidden"]').value;
    log(token);
    await agent
        .post("https://atcoder.jp/login")
        .set("referer", "https://atcoder.jp/login")
        .set("origin", "https://atcoder.jp")
        .set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36")
        .send("username=" + encodeURIComponent(config.username))
        .send("password=" + encodeURIComponent(config.password))
        .send("csrf_token=" + encodeURIComponent(token));
    if (!await isLoggedIn()) {
        throw new Error("Login failed");
    }
    log("Done");
};
const submit = async (problem, source, language) => {
    if (language === null) {
        throw new Error("Language Rejected");
    }
    const contest = problem.substring(0, problem.indexOf("_"));
    const URL = `https://atcoder.jp/contests/${contest}/tasks/${problem}`;
    const problemPage = await agent
        .get(URL)
        .set("referer", "https://atcoder.jp/")
        .set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36");
    const problemDOM = new jsdom_1.JSDOM(problemPage.text);
    const token = problemDOM.window.document.querySelector('input[type="hidden"][name="csrf_token"]').value;
    log(token);
    const submissions = await agent
        .post(`https://atcoder.jp/contests/${contest}/submit`)
        .set("origin", "https://atcoder.jp")
        .set("referer", URL)
        .set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36")
        .send("data.TaskScreenName=" + encodeURIComponent(problem))
        .send("data.LanguageId=" + encodeURIComponent(language))
        .send("sourceCode=" + encodeURIComponent(source))
        .send("csrf_token=" + encodeURIComponent(token));
    const resultNode = new jsdom_1.JSDOM(submissions.text).window.document.querySelector("#main-container > div.row > div:nth-child(3) > div.panel.panel-default.panel-submission > div.table-responsive > table > tbody > tr:nth-child(1) > td:nth-child(8) > a");
    if (!resultNode) {
        throw new Error("Submit failed");
    }
    const id = parseInt(/submissions\/([0-9]+)/.exec(resultNode.href)[1], 10);
    return `${contest}_${id}`;
};
const updateMap = new Map();
const convertStatus = (status) => {
    if (status.indexOf("/") !== -1) {
        return interfaces_1.SolutionResult.Judging;
    }
    switch (status) {
        case "AC":
            return interfaces_1.SolutionResult.Accepted;
        case "WA":
        case "QLE":
        case "OLE":
        case "IE":
            return interfaces_1.SolutionResult.WrongAnswer;
        case "TLE":
            return interfaces_1.SolutionResult.TimeLimitExceeded;
        case "MLE":
            return interfaces_1.SolutionResult.MemoryLimitExceeded;
        case "RE":
            return interfaces_1.SolutionResult.RuntimeError;
        case "CE":
            return interfaces_1.SolutionResult.CompileError;
        case "WJ":
        case "WR":
            return interfaces_1.SolutionResult.WaitingJudge;
        case "/":
        case "Judging":
            return interfaces_1.SolutionResult.Judging;
    }
    return interfaces_1.SolutionResult.OtherError;
};
const fetch = async (runID) => {
    try {
        const contest = runID.substring(0, runID.indexOf("_"));
        const id = runID.substring(runID.indexOf("_") + 1);
        const result = await agent
            .get(`https://atcoder.jp/contests/${contest}/submissions/${id}`)
            .set("referer", "https://atcoder.jp/")
            .set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36");
        const document = new jsdom_1.JSDOM(result.text).window.document;
        const get = (path) => {
            const node = document.querySelector(path);
            if (!node) {
                return "/";
            }
            return node.textContent.trim();
        };
        const status = convertStatus(get("#main-container > div.row > div:nth-child(2) > div:nth-child(6) > table > tbody > tr:nth-child(7) > td > span"));
        const score = status === interfaces_1.SolutionResult.Accepted ? 100 : 0;
        return {
            details: {
                runID,
                remoteUser: get("#main-container > div.row > div:nth-child(2) > div:nth-child(6) > table > tbody > tr:nth-child(3) > td > a:nth-child(1)"),
                remoteProblem: get("#main-container > div.row > div:nth-child(2) > div:nth-child(6) > table > tbody > tr:nth-child(2) > td > a"),
                submitTime: get("#main-container > div.row > div:nth-child(2) > div:nth-child(6) > table > tbody > tr:nth-child(1) > td > time"),
                memory: get("#main-container > div.row > div:nth-child(2) > div:nth-child(6) > table > tbody > tr:nth-child(9) > td"),
                time: get("#main-container > div.row > div:nth-child(2) > div:nth-child(6) > table > tbody > tr:nth-child(8) > td"),
            },
            status,
            score,
        };
    }
    catch (e) {
        return {
            details: {
                error: e.message,
            },
            status: interfaces_1.SolutionResult.JudgementFailed,
            score: 0,
        };
    }
};
const updateSolutionResults = async () => {
    for (const [runid, cb] of updateMap) {
        try {
            const result = await fetch(runid);
            cb(result);
            if (result.status !== interfaces_1.SolutionResult.Judging && result.status !== interfaces_1.SolutionResult.WaitingJudge) {
                updateMap.delete(runid);
            }
        }
        catch (e) {
            cb({ status: interfaces_1.SolutionResult.JudgementFailed, score: 0, details: { error: e.message, runID: runid } });
        }
    }
    setTimeout(updateSolutionResults, UPDATE_INTERVAL);
};
const main = async (problem, solution, resolve, update) => {
    if (interfaces_1.Problem.guard(problem)) {
        if (interfaces_1.Solution.guard(solution)) {
            if (!await isLoggedIn()) {
                try {
                    await initRequest();
                }
                catch (e) {
                    return update({ status: interfaces_1.SolutionResult.JudgementFailed, score: 0, details: { error: e.message } });
                }
            }
            try {
                let langcode = null;
                if (solution.language === "c") {
                    langcode = "3002";
                }
                else if (solution.language === "cpp98") {
                    langcode = "3029";
                }
                else if (solution.language === "cpp14") {
                    langcode = "3003";
                }
                else if (solution.language === "pascal") {
                    langcode = "3019";
                }
                else if (solution.language === "java") {
                    langcode = "3016";
                }
                else if (solution.language === "node") {
                    langcode = "3017";
                }
                else if (solution.language === "python2") {
                    langcode = "3022";
                }
                else if (solution.language === "python3") {
                    langcode = "3023";
                }
                if (langcode === null) {
                    return update({ status: interfaces_1.SolutionResult.JudgementFailed, score: 0, details: { error: "Language rejected" } });
                }
                const source = await resolve(solution.file);
                const stat = fs_1.statSync(source.path);
                if (stat.size > MAX_SOURCE_SIZE) {
                    return update({ status: interfaces_1.SolutionResult.JudgementFailed, score: 0, details: { error: "File is too big" } });
                }
                const content = fs_1.readFileSync(source.path).toString();
                const runID = await submit(problem.id, content, langcode);
                updateMap.set(runID, update);
            }
            catch (e) {
                return update({ status: interfaces_1.SolutionResult.JudgementFailed, score: 0, details: { error: "Invalid solution" } });
            }
        }
        else {
            return update({ status: interfaces_1.SolutionResult.JudgementFailed, score: 0, details: { error: "Invalid solution" } });
        }
    }
    else {
        return update({ status: interfaces_1.SolutionResult.JudgementFailed, score: 0, details: { error: "Invalid problem" } });
    }
};
module.exports = main;
updateSolutionResults();
//# sourceMappingURL=index.js.map