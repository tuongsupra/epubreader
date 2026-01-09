
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Library from './pages/Library';
import Reader from './pages/Reader';
import Login from './pages/Login';

// Placeholder Pages
const SettingsPage = () => <div className="p-8">Settings Page (Coming Soon)</div>;
const ProfilePage = () => <div className="p-8">Profile Page (Coming Soon)</div>;

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/library" replace />} />
          <Route path="library" element={<Library />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="login" element={<Login />} />
        </Route>

        {/* Reader is outside of AppLayout for full screen */}
        <Route path="/read/:id" element={<Reader />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
