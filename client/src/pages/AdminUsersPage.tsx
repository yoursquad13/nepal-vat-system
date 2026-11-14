import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  UserCheck,
  Search,
  RefreshCw,
  Edit2,
  Phone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  KeyRound,
  Shield,
  UserX,
} from 'lucide-react';
import { api, User, UserRole, CreateUserInput, UpdateUserInput } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'STAFF'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);

  // Form submission loading states
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add User Form State
  const [newFullName, setNewFullName] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newRole, setNewRole] = useState<UserRole>('STAFF');
  const [newPhone, setNewPhone] = useState<string>('');

  // Edit User Form State
  const [editFullName, setEditFullName] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editRole, setEditRole] = useState<UserRole>('STAFF');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editNewPassword, setEditNewPassword] = useState<string>('');

  // Fetch users list
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.users.list();
      setUsers(res.users || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load user accounts');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // KPIs
  const kpis = useMemo(() => {
    const total = users.length;
    let active = 0;
    let admins = 0;
    let staff = 0;

    users.forEach((u) => {
      const isActive = u.is_active ?? u.isActive ?? true;
      if (isActive) active++;
      if (u.role === 'ADMIN') admins++;
      if (u.role === 'STAFF') staff++;
    });

    return { total, active, admins, staff };
  }, [users]);

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const fullName = u.full_name ?? u.fullName ?? '';
      const isActive = u.is_active ?? u.isActive ?? true;

      // Search matching
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = fullName.toLowerCase().includes(q);
        const matchesUsername = u.username.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesPhone = u.phone?.toLowerCase().includes(q);
        if (!matchesName && !matchesUsername && !matchesEmail && !matchesPhone) {
          return false;
        }
      }

      // Role filter
      if (roleFilter !== 'ALL' && u.role !== roleFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'ACTIVE' && !isActive) return false;
      if (statusFilter === 'INACTIVE' && isActive) return false;

      return true;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Open Add Modal
  const handleOpenAddModal = () => {
    setNewFullName('');
    setNewUsername('');
    setNewEmail('');
    setNewPassword('');
    setNewRole('STAFF');
    setNewPhone('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Submit Add User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newFullName.trim()) {
      setFormError('Full name is required');
      return;
    }
    if (newUsername.trim().length < 3) {
      setFormError('Username must be at least 3 characters');
      return;
    }
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setFormError('Valid email address is required');
      return;
    }
    if (newPassword.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateUserInput = {
        full_name: newFullName.trim(),
        username: newUsername.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
        phone: newPhone.trim() || null,
      };

      await api.users.create(payload);
      toast.success(`User account created for ${newFullName}`);
      setIsAddModalOpen(false);
      await fetchUsers();
    } catch (err: any) {
      const msg = err.message || 'Failed to create user account';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (targetUser: User) => {
    setEditingUser(targetUser);
    setEditFullName(targetUser.full_name ?? targetUser.fullName ?? '');
    setEditEmail(targetUser.email ?? '');
    setEditRole(targetUser.role ?? 'STAFF');
    setEditPhone(targetUser.phone ?? '');
    setEditIsActive(targetUser.is_active ?? targetUser.isActive ?? true);
    setEditNewPassword('');
    setFormError(null);
  };

  // Submit Edit User
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setFormError(null);

    if (!editFullName.trim()) {
      setFormError('Full name cannot be blank');
      return;
    }
    if (!editEmail.trim() || !editEmail.includes('@')) {
      setFormError('Valid email address is required');
      return;
    }
    if (editNewPassword.trim() && editNewPassword.trim().length < 6) {
      setFormError('New password must be at least 6 characters');
      return;
    }

    // Guard: Prevent self-deactivation
    if (editingUser.id === currentUser?.id && !editIsActive) {
      setFormError('You cannot deactivate your own administrative account.');
      return;
    }

    // Guard: Prevent self-demotion from Admin
    if (editingUser.id === currentUser?.id && editRole !== 'ADMIN') {
      setFormError('You cannot remove Admin role from your own active account.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: UpdateUserInput = {
        full_name: editFullName.trim(),
        email: editEmail.trim().toLowerCase(),
        role: editRole,
        phone: editPhone.trim() || null,
        is_active: editIsActive,
      };

      if (editNewPassword.trim()) {
        payload.password = editNewPassword.trim();
      }

      await api.users.update(editingUser.id, payload);
      toast.success(`Updated account for ${editFullName}`);
      setEditingUser(null);
      await fetchUsers();
    } catch (err: any) {
      const msg = err.message || 'Failed to update user';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle quick activate/deactivate
  const handleConfirmToggleActive = async () => {
    if (!deactivatingUser) return;
    const currentActive = deactivatingUser.is_active ?? deactivatingUser.isActive ?? true;
    const willBeActive = !currentActive;

    if (deactivatingUser.id === currentUser?.id) {
      toast.error('You cannot deactivate your own account.');
      setDeactivatingUser(null);
      return;
    }

    setSubmitting(true);
    try {
      await api.users.update(deactivatingUser.id, { is_active: willBeActive });
      toast.success(
        `User ${deactivatingUser.username} is now ${willBeActive ? 'Active' : 'Deactivated'}`
      );
      setDeactivatingUser(null);
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to change account status');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                User & Staff Management
              </h1>
              <p className="text-xs md:text-sm text-slate-500">
                Manage system login credentials, staff vs administrator roles, and access controls
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-xs"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New User</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Accounts</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{kpis.total}</p>
          <p className="text-[11px] text-slate-500 mt-1">Configured users</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Active Users</span>
            <UserCheck className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{kpis.active}</p>
          <p className="text-[11px] text-slate-500 mt-1">Permitted to log in</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-indigo-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Administrators</span>
            <ShieldCheck className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{kpis.admins}</p>
          <p className="text-[11px] text-slate-500 mt-1">Full system privilege</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Staff Users</span>
            <Users className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{kpis.staff}</p>
          <p className="text-[11px] text-slate-500 mt-1">Purchase & stock entry</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, username, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Role Filter */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {(['ALL', 'ADMIN', 'STAFF'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  roleFilter === r
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r === 'ALL' ? 'All Roles' : r}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  statusFilter === s
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s === 'ALL' ? 'All Status' : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <RefreshCw className="w-7 h-7 animate-spin text-indigo-600" />
            <p className="text-sm font-medium">Loading user accounts...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-20 px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">No users found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              No accounts match the current filter or search criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider text-[11px]">
                  <th className="py-3 px-4">User Details</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Contact Phone</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const fullName = u.full_name ?? u.fullName ?? 'Unnamed User';
                  const isActive = u.is_active ?? u.isActive ?? true;
                  const isSelf = u.id === currentUser?.id;
                  const createdStr = u.created_at ? new Date(u.created_at).toLocaleDateString() : '-';

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Username & Email */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                              u.role === 'ADMIN'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {fullName.charAt(0) || u.username.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-xs">{fullName}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                              <span className="font-mono">@{u.username}</span>
                              <span>•</span>
                              <span>{u.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3 px-4">
                        {u.role === 'ADMIN' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Shield className="w-3 h-3 text-indigo-600" />
                            <span>Administrator</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            <Users className="w-3 h-3 text-slate-500" />
                            <span>Staff Member</span>
                          </span>
                        )}
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {u.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{u.phone}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>Inactive</span>
                          </span>
                        )}
                      </td>

                      {/* Created At */}
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {createdStr}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                            title="Edit details or reset password"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => setDeactivatingUser(u)}
                            className={`p-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              isSelf
                                ? 'opacity-30 cursor-not-allowed text-slate-400'
                                : isActive
                                ? 'text-rose-600 hover:bg-rose-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={
                              isSelf
                                ? 'Cannot deactivate self'
                                : isActive
                                ? 'Deactivate account'
                                : 'Activate account'
                            }
                          >
                            {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Create New User Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Shrestha"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ramesh.s"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().trim())}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="ramesh@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value.toLowerCase())}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Initial Password <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    System Role <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value="STAFF">Staff (Voucher & Stock Entry)</option>
                    <option value="ADMIN">Admin (Full Control, Approvals & Backups)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Contact Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9841000000"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User & Reset Password Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Edit User: @{editingUser.username}
                  </h3>
                  <p className="text-xs text-slate-500">Update details or reset account password</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value.toLowerCase())}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    System Role <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editRole}
                    disabled={editingUser.id === currentUser?.id}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-medium focus:outline-hidden focus:border-indigo-500 disabled:opacity-50"
                  >
                    <option value="STAFF">Staff (Voucher & Stock Entry)</option>
                    <option value="ADMIN">Admin (Full Control)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9841000000"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Password Reset Section */}
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                  <span>Reset Password (Optional)</span>
                </div>
                <p className="text-[11px] text-amber-700">
                  Leave blank to keep existing password. If changing, provide at least 6 characters.
                </p>
                <input
                  type="password"
                  placeholder="Enter new password (optional)"
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-sm text-slate-900 font-mono focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-slate-800">Account Active Status</p>
                  <p className="text-[11px] text-slate-500">
                    Inactive users cannot sign in to the application
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    disabled={editingUser.id === currentUser?.id}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-disabled:opacity-50"></div>
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Quick Status Toggle */}
      {deactivatingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {(deactivatingUser.is_active ?? deactivatingUser.isActive ?? true)
                  ? 'Deactivate User Account?'
                  : 'Reactivate User Account?'}
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                {(deactivatingUser.is_active ?? deactivatingUser.isActive ?? true)
                  ? `Are you sure you want to deactivate ${deactivatingUser.full_name || deactivatingUser.username}? They will no longer be able to log in.`
                  : `Are you sure you want to reactivate ${deactivatingUser.full_name || deactivatingUser.username}? They will regain access to the system.`}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeactivatingUser(null)}
                disabled={submitting}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleActive}
                disabled={submitting}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white rounded-lg transition-colors shadow-xs disabled:opacity-50 ${
                  (deactivatingUser.is_active ?? deactivatingUser.isActive ?? true)
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {(deactivatingUser.is_active ?? deactivatingUser.isActive ?? true)
                    ? 'Confirm Deactivation'
                    : 'Confirm Reactivation'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default AdminUsersPage;
