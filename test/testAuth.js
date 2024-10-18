'use strict';
const testData = require('./config.js')['phev2'];
const config = require('../lib/const.js');
const AuthHandler = require('../lib/auth.js');

const auth = new AuthHandler(testData.vccLoginToken);

const username = testData.credentials.user;
const password = testData.credentials.password;

(async () => {

    const response = await auth.authorize(username, password);

    console.log('-------------------------------------------------------------------------------------------');
    console.log(`[${username}] Final auth state '${response.authState}'`);
    console.log(`[${username}] Cookie`);
    console.log(response.response.cookie);
    console.log(`[${username}] CheckOtp URL '${response.response.data._links.checkOtp.href}'`);
    console.log('-------------------------------------------------------------------------------------------');
    if (response.authState == config.authState.OTP_REQUIRED) {

        console.log('OTP email sent, check');

        // } else if (response.authState == config.authState.OTP_VERIFIED) {
        // auth.continueAuth(response.data._links.continueAuthentication.href,
        //     response.data.cookie)
        //     .then(response => {

        //     })
        //     .catch(reason => {
        //         console.log(reason);
        //     });
        // } else if (response.authState == config.authState.COMPLETED) {

    } else {
        // return Promise.reject(new Error(`Unkown auth state '${authState}'`));
        console.log(`Auth state not implemented '${response.authState}'`);
    }
})().catch(reason => {
    console.log(reason);
});

