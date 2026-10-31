import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Login from '../pages/Login';

const login = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login }),
  AuthProvider: ({ children }) => <div>{children}</div>,
}));

describe('Login Component', () => {
  it('renders the labelled login form', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in to console/i })).toBeInTheDocument();
  });

  it('validates empty fields without calling the API', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Sign in to console/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/username and password/i);
    expect(login).not.toHaveBeenCalled();
  });
});
