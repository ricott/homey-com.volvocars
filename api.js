'use strict';

module.exports = {
    /**
     * Sign out of all saved Volvo ID sessions and mark all devices unavailable.
     * The user can then repair each device to sign in again, optionally with a
     * different Volvo ID.
     */
    async signOut({ homey }) {
        return homey.app.signOutAllSessions();
    }
};
