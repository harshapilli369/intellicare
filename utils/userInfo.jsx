export function getRole() {
  return window.localStorage.getItem('userRole');
}

export function setRole() {
    window.localStorage.setItem('userRole', role);
}

export function getUserId() {
  return window.localStorage.getItem('userId');
}

export function setUserId(id) {
  if (id !== undefined && id !== null) {
    window.localStorage.setItem('userId', String(id));
  }
}

export function clearUserInfo() {
  window.localStorage.removeItem('userRole');
  window.localStorage.removeItem('userId');
}
