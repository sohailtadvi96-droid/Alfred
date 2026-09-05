import { NavLink } from 'react-router-dom';

/** Boards | Discover — shown at the top of both Design screens. */
export function DesignTabs() {
  return (
    <div className="design-tabs" role="tablist" aria-label="Design view">
      <NavLink to="/design" end className={({ isActive }) => (isActive ? 'on' : '')} role="tab">
        Boards
      </NavLink>
      <NavLink
        to="/design/discover"
        className={({ isActive }) => (isActive ? 'on' : '')}
        role="tab"
      >
        Discover
      </NavLink>
    </div>
  );
}
