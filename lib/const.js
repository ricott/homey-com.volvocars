'use strict';

const apiDomain = 'api.volvocars.com';
const oAuthDomain = 'volvoid.eu.volvocars.com';
const apiTimeout = 10000;

const commands = {
    CLIMATIZATION_START: 'CLIMATIZATION_START',
    CLIMATIZATION_STOP: 'CLIMATIZATION_STOP',
    ENGINE_START: 'ENGINE_START',
    ENGINE_STOP: 'ENGINE_STOP',
    FLASH: 'FLASH',
    HONK: 'HONK',
    HONK_AND_FLASH: 'HONK_AND_FLASH',
    LOCK: 'LOCK',
    LOCK_REDUCED_GUARD: 'LOCK_REDUCED_GUARD',
    UNLOCK: 'UNLOCK',
}

const vehicleType = {
    ICE: 'ICE',
    HYBRID: 'HYBRID',
    ELECTRIC: 'ELECTRIC'
};

const chargingSystemStatus = {
    CHARGING_SYSTEM_CHARGING: 'CHARGING_SYSTEM_CHARGING',
    CHARGING_SYSTEM_IDLE: 'CHARGING_SYSTEM_IDLE',
    CHARGING_SYSTEM_DONE: 'CHARGING_SYSTEM_DONE',
    CHARGING_SYSTEM_FAULT: 'CHARGING_SYSTEM_FAULT',
    CHARGING_SYSTEM_SCHEDULED: 'CHARGING_SYSTEM_SCHEDULED',
    CHARGING_SYSTEM_UNSPECIFIED: 'CHARGING_SYSTEM_UNSPECIFIED'
};

const location = {
    HOME: 'home',
    AWAY: 'away',
    UNKNOWN: 'unknown'
}

const authState = {
    USERNAME_PASSWORD_REQUIRED: 'USERNAME_PASSWORD_REQUIRED',
    OTP_REQUIRED: 'OTP_REQUIRED',
    OTP_VERIFIED: 'OTP_VERIFIED',
    COMPLETED: 'COMPLETED'
}

module.exports = {
    apiDomain,
    oAuthDomain,
    apiTimeout,
    commands,
    vehicleType,
    chargingSystemStatus,
    location,
    authState
}