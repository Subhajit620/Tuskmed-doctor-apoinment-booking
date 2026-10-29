import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // secure session cookie
});

export default api;

export function apiErrorMessage(err, fallback = 'Something went wrong') {
  return err?.response?.data?.error?.message || err?.message || fallback;
}
