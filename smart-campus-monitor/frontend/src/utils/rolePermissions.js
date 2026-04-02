// Role-based permission utility
export const ROLES = {
  ADMIN: 'admin',
  WARDEN: 'warden',
  SECURITY: 'security',
};

// Define which roles can access which routes
export const ROUTE_PERMISSIONS = {
  '/dashboard': [ROLES.ADMIN, ROLES.WARDEN, ROLES.SECURITY],
  '/scanner': [ROLES.ADMIN, ROLES.SECURITY],
  '/logs': [ROLES.ADMIN, ROLES.WARDEN, ROLES.SECURITY],
  '/analytics': [ROLES.ADMIN, ROLES.WARDEN],
  '/hostellers': [ROLES.ADMIN, ROLES.WARDEN],
  '/admin/students': [ROLES.ADMIN],
  '/admin/enrollment': [ROLES.ADMIN],
  '/admin/access-control': [ROLES.ADMIN],
  '/admin/warden-portal': [ROLES.ADMIN, ROLES.WARDEN],
  '/admin/terminals': [ROLES.ADMIN],
  '/admin/settings': [ROLES.ADMIN],
};

// Check if a user has permission to access a route
export const hasRoutePermission = (userRole, routePath) => {
  if (!userRole) return false;
  
  const allowedRoles = ROUTE_PERMISSIONS[routePath];
  if (!allowedRoles) return true; // Allow if route not defined (public)
  
  return allowedRoles.includes(userRole);
};

// Check if user has any of the required roles
export const hasRole = (userRole, requiredRoles) => {
  if (!userRole) return false;
  if (!requiredRoles || requiredRoles.length === 0) return true;
  
  return requiredRoles.includes(userRole);
};

// Get navigation items filtered by user role
export const getFilteredNavItems = (navItems, userRole) => {
  if (!userRole) return [];
  
  return navItems.filter(item => {
    const allowedRoles = ROUTE_PERMISSIONS[item.to];
    if (!allowedRoles) return true;
    return allowedRoles.includes(userRole);
  });
};
