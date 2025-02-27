'use strict';
const testData = require('./config.js')['phev2'];
const AuthHandler = require('../lib/auth.js');

const auth = new AuthHandler(testData.vccLoginToken);

(async () => {

    const path = 'https://volvoid.eu.volvocars.com/pf-ws/authn/flows/SkGCluGbZd';
    const cookie = [
        'pf-hfa-volvoidenabledsessions-rmu=; Path=/; Expires=Thu, 01-Jan-1970 00:00:00 GMT; Max-Age=0; Secure; HttpOnly; SameSite=None',
        'PF=gZXn7nqqN6r7WLWUhTGuLQkb2aTYUKKliDocowiivzWI; Path=/; Expires=Fri, 18-Oct-2024 13:30:44 GMT; Max-Age=3600; Secure; HttpOnly; SameSite=None',
        'pf-hfa-exp-pwd=; Path=/; Expires=Thu, 01-Jan-1970 00:00:00 GMT; Max-Age=0; Secure; HttpOnly; SameSite=None',
        'PF.PERSISTENT=b9dxyjxeJGGlgpDpShTXsaR54; Path=/; Expires=Thu, 16-Jan-2025 12:30:44 GMT; Max-Age=7776000; Secure; HttpOnly; SameSite=None'
      ];
    const otp = '173781';
    const username = 'test-user';

    const response = await auth.verifyOtp(path, cookie, otp, username);
    console.log(response);

})().catch(reason => {
    console.log(reason);
});

