import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TOKEN_KEY = 'linkdeck_access_token';

function setAuthToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    delete axios.defaults.headers.common.Authorization;
  }
}

function userFromAuthResponse(data) {
  if (data?.access_token) setAuthToken(data.access_token);
  if (!data) return data;
  const { access_token, ...user } = data;
  return user;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = not auth
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) setAuthToken(token);
      const { data } = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(data);
    } catch {
      setAuthToken(null);
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (email, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password }, { withCredentials: true });
    const userData = userFromAuthResponse(data);
    setUser(userData);
    return userData;
  };

  const register = async (email, password, name) => {
    const { data } = await axios.post(`${API}/auth/register`, { email, password, name }, { withCredentials: true });
    const userData = userFromAuthResponse(data);
    setUser(userData);
    return userData;
  };

  const logout = async () => {
    await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    setAuthToken(null);
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
