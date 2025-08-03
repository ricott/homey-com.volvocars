'use strict';

const apiTimeout = 10000;

const API_URL = 'https://api.volvocars.com';
const TOKEN_URL = 'https://volvoid.eu.volvocars.com/as/token.oauth2';
const AUTHORIZATION_URL = 'https://volvoid.eu.volvocars.com/as/authorization.oauth2';
const OAUTH_SCOPES = [
    'openid',
    'location:read',
    'vehicle:attributes',
    'energy:state:read',
    'energy:capability:read',
    'conve:battery_charge_level',
    'conve:brake_status',
    'conve:climatization_start_stop',
    'conve:command_accessibility',
    'conve:commands',
    'conve:connectivity_status',
    'conve:diagnostics_engine_status',
    'conve:diagnostics_workshop',
    'conve:doors_status',
    'conve:engine_status',
    'conve:engine_start_stop',
    'conve:environment',
    'conve:fuel_status',
    'conve:honk_flash',
    'conve:lock',
    'conve:lock_status',
    'conve:navigation',
    'conve:odometer_status',
    'conve:trip_statistics',
    'conve:tyre_status',
    'conve:unlock',
    'conve:vehicle_relation',
    'conve:warnings',
    'conve:windows_status'
];

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
    apiTimeout,
    commands,
    vehicleType,
    chargingSystemStatus,
    location,
    authState,
    OAUTH_SCOPES,
    API_URL,
    TOKEN_URL,
    AUTHORIZATION_URL
}