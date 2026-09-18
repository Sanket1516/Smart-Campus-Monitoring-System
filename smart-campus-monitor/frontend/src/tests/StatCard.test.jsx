import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import StatCard from '../components/StatCard';
import { FiUsers } from 'react-icons/fi';

describe('StatCard Component', () => {
  it('renders title and value correctly', () => {
    render(
      <StatCard 
        title="Total Users" 
        value="1,234" 
        icon={FiUsers} 
        color="blue"
        subtitle="+5%"
      />
    );
    
    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('+5%')).toBeInTheDocument();
  });
});
