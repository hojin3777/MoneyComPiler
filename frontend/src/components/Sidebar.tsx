import React from 'react';
import { FaQuestionCircle, FaCog } from 'react-icons/fa';

interface SidebarProps {
  activePage: string;
  setActivePage: (page: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activePage, setActivePage }) => {
  const menuItems = ['Dashboard', 'Monthly', 'Transactions', 'Categories', 'Mapping'];

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <h2>MyData</h2>
      </header>
      <nav className="sidebar-nav">
        <ul>
          {menuItems.map(item => (
            <li 
              key={item} 
              className={activePage === item ? 'active' : ''}
              onClick={() => setActivePage(item)}
            >
              {item}
            </li>
          ))}
        </ul>
      </nav>
      <footer className="sidebar-footer">
        <FaQuestionCircle className="icon-button" />
        <FaCog className="icon-button" />
      </footer>
    </aside>
  );
};

export default Sidebar;