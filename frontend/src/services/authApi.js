import api from './api';

// The invitation endpoints are the only ones called before anyone is signed in,
// so nothing here expects a token. The token arrives as a result of redeeming.

// Asks whether a link is still good and who it belongs to. Rejects for an
// expired, spent, or invented token alike.
export const checkInvitation = (token) =>
  api.get(`/auth/invite/${token}`).then((r) => r.data.invitation);

// Spends the invitation to set a first password. The account is signed in from
// here, so the session is stored the same way a normal sign-in stores it.
export const acceptInvitation = (token, password) =>
  api.post(`/auth/invite/${token}`, { password }).then((r) => {
    localStorage.setItem('token', r.data.token);
    return r.data.user;
  });
