import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sliders,
  Snowflake,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { authApi, type UserManageItem, type UserManageData, type PermissionGroupMeta } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import PermissionTreeCard from "@/components/PermissionTreeCard";

// 与后端 User.ROLE_CHOICES 对齐：mother/father/grandma/caregiver + admin(管理员)
const ROLE_LABELS = [
  { key: "", label: "全部角色" },
  { key: "mother", label: "妈妈" },
  { key: "father", label: "爸爸" },
  { key: "grandma", label: "奶奶/外婆" },
  { key: "caregiver", label: "其他照护者" },
  { key: "admin", label: "管理员" },
];

const SECURITY_QUESTIONS = [
  { key: "pet", label: "你的宠物叫什么名字？" },
  { key: "city", label: "你出生的城市是哪里？" },
  { key: "teacher", label: "你小学班主任姓什么？" },
  { key: "food", label: "你最爱的食物是什么？" },
  { key: "book", label: "你最喜欢的一本书叫什么？" },
];

// 递归权限拓扑映射关系（子权限 -> 直接父权限）
const PERMISSION_PARENT_MAP: Record<string, string> = {
  // 待产包清单
  shopping_list_view: "menu_shopping_list",
  shopping_list_create: "shopping_list_view",
  shopping_list_update: "shopping_list_view",
  shopping_list_delete: "shopping_list_view",

  // 健康中心
  health_record_view: "menu_health",
  health_record_create: "health_record_view",
  health_record_update: "health_record_view",
  health_record_delete: "health_record_view",

  // 宝宝档案
  baby_create: "baby_view",
  baby_update: "baby_view",
  baby_delete: "baby_view",

  // 商品库中心（v1.88.1 收藏已独立到「我的收藏中心」组）
  product_view: "menu_products",
  product_ai_evaluate: "product_view",

  // v1.88.1 我的收藏中心：menu_favorites -> favorite_view -> [favorite_create, favorite_delete]
  favorite_view: "menu_favorites",
  favorite_create: "favorite_view",
  favorite_delete: "favorite_view",

  // AI 助手
  ai_chat: "menu_ai_assistant",
  ai_session_create: "menu_ai_assistant",
  ai_session_rename: "menu_ai_assistant",
  ai_session_delete: "menu_ai_assistant",
  ai_fetch_models: "menu_ai_assistant",

  // 管理后台模块
  backup_config_manage: "menu_admin_backups",
  backup_trigger: "menu_admin_backups",
  backup_restore: "menu_admin_backups",
  backup_task_manage: "menu_admin_backups",
  service_config_view: "menu_admin_service_config",
  service_config_update: "menu_admin_service_config",
  daily_tips_view: "menu_admin_daily_tips",
  daily_tips_manage: "menu_admin_daily_tips",
  registration_manage: "menu_admin_registration",
  product_manage_create: "menu_admin_products_manage",
  product_manage_edit: "menu_admin_products_manage",
  product_manage_delete: "menu_admin_products_manage",
  user_manage_view: "menu_admin_users",
  user_manage_edit: "menu_admin_users",
  user_manage_freeze: "menu_admin_users",
  permission_manage: "menu_admin_users",
  audit_log_view: "menu_admin_audit_logs",
  audit_log_clean: "menu_admin_audit_logs",
};

const PERMISSION_CHILDREN_MAP: Record<string, string[]> = {};
Object.entries(PERMISSION_PARENT_MAP).forEach(([child, parent]) => {
  if (!PERMISSION_CHILDREN_MAP[parent]) PERMISSION_CHILDREN_MAP[parent] = [];
  PERMISSION_CHILDREN_MAP[parent].push(child);
});

const PERMISSION_KEY_NAMES: Record<string, string> = {
  menu_shopping_list: "待产包菜单",
  shopping_list_view: "查看清单",
  menu_health: "健康中心菜单",
  health_record_view: "查看档案",
  menu_products: "商品库菜单",
  product_view: "浏览商品",
  menu_ai_assistant: "AI助手菜单",
  ai_fetch_models: "拉取模型列表",
  menu_weather: "天气预报菜单",
  baby_view: "查看宝宝档案",
  // v1.88.1 收藏中心（优先级低于运行时从 definitions 构建的名称表）
  menu_favorites: "我的收藏菜单",
  favorite_view: "查看收藏中心",
};

function applyPermissionChange(
  current: Record<string, boolean>,
  key: string,
  targetState: boolean
): Record<string, boolean> {
  const next = { ...current };
  next[key] = targetState;

  if (targetState) {
    // 规则 1：开启子权限时，递归自动开启其所有祖先父权限
    let cur = key;
    while (PERMISSION_PARENT_MAP[cur]) {
      const p = PERMISSION_PARENT_MAP[cur];
      next[p] = true;
      cur = p;
    }
  } else {
    // 规则 2：关闭父权限时，递归自动关闭其所有后代子权限
    const disableDescendants = (pKey: string) => {
      const children = PERMISSION_CHILDREN_MAP[pKey] || [];
      children.forEach((cKey) => {
        next[cKey] = false;
        disableDescendants(cKey);
      });
    };
    disableDescendants(key);
  }

  return next;
}

const SECURITY_Q_MAP: Record<string, string> = Object.fromEntries(SECURITY_QUESTIONS.map((q) => [q.key, q.label]));

export default function UserManagePage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"users" | "permissions">("users");

  // 用户与安全风控状态
  const [users, setUsers] = useState<UserManageItem[]>([]);
  const [secConfig, setSecConfig] = useState({ login_captcha_threshold: 3, login_freeze_threshold: 10, login_lock_minutes: 5, login_lock_seconds: 300, forgot_password_max_attempts: 5, admin_session_timeout_minutes: 30 });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ nickname: "", role: "mother", is_staff: false, is_active: true });
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPwd, setResetPwd] = useState({ pwd: "", confirm: "", showPwd: false, showConfirm: false });
  const [secId, setSecId] = useState<number | null>(null);
  const [secForm, setSecForm] = useState({ question: "", answer: "" });
  const [toast, setToast] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showSecConfig, setShowSecConfig] = useState(false);
  const [secConfigForm, setSecConfigForm] = useState({ login_captcha_threshold: 3, login_freeze_threshold: 10, login_lock_minutes: 5, login_lock_seconds: 300, forgot_password_max_attempts: 5, admin_session_timeout_minutes: 30 });
  const [secConfigSaving, setSecConfigSaving] = useState(false);

  // 指定具体用户权限弹窗状态
  const [targetUserModal, setTargetUserModal] = useState<UserManageItem | null>(null);
  const [targetUserPerms, setTargetUserPerms] = useState<Record<string, boolean>>({});
  const [targetUserDefs, setTargetUserDefs] = useState<PermissionGroupMeta[]>([]);
  const [targetUserLoading, setTargetUserLoading] = useState(false);
  const [targetUserSaving, setTargetUserSaving] = useState(false);
  const [targetUserHasCustom, setTargetUserHasCustom] = useState(false);

  // 权限管控状态
  const [permDefinitions, setPermDefinitions] = useState<PermissionGroupMeta[]>([]);
  const [permissionsState, setPermissionsState] = useState<Record<string, boolean>>({});
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsSaving, setPermsSaving] = useState(false);
  // v1.88.2 分组独立保存：已保存到服务器的基线（其他分组未保存的草稿不随组提交）
  const [savedPermissionsState, setSavedPermissionsState] = useState<Record<string, boolean>>({});
  const [savedTargetUserPerms, setSavedTargetUserPerms] = useState<Record<string, boolean>>({});
  const [savingGroupKey, setSavingGroupKey] = useState<string | null>(null);

  /** v1.88.1 权限键 → 展示名（优先从 definitions 构建，兜底静态表）：权限树依赖徽标用 */
  const permNameMap = useMemo(() => {
    const m: Record<string, string> = { ...PERMISSION_KEY_NAMES };
    for (const g of permDefinitions) {
      for (const p of g.permissions) m[p.key] = p.name;
    }
    for (const g of targetUserDefs) {
      for (const p of g.permissions) m[p.key] = p.name;
    }
    return m;
  }, [permDefinitions, targetUserDefs]);

  /** v1.88.1 系统全量权限项总数（管理员概览与用户弹窗计数用，替代旧硬编码 31） */
  const permTotalCount = useMemo(
    () => (permDefinitions.length ? permDefinitions : targetUserDefs).reduce((n, g) => n + g.permissions.length, 0),
    [permDefinitions, targetUserDefs]
  );

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // 管理员账号判断：系统管理员具备免冻结保护
  const isAdminUser = (u: UserManageItem) =>
    Boolean(u.is_staff || u.role === "admin" || u.phone === "admin" || u.username === "admin");

  // 冻结状态统一判定：管理员账号永不冻结；普通用户当 is_active 为 false、密码连续失败达冻结阈值、或密保连续失败达上限时视为冻结
  const isUserFrozen = (u: UserManageItem) => {
    if (isAdminUser(u)) return false;
    const pwdFrozen = (u.login_fail_count ?? 0) >= (secConfig.login_freeze_threshold ?? 10);
    const secFrozen = (u.security_fail_count ?? 0) >= (secConfig.forgot_password_max_attempts ?? 5);
    return !u.is_active || pwdFrozen || secFrozen;
  };

    // 风控限制一键重置（支持管理员与普通用户：清空输错次数、重置锁定倒计时、自动解冻）
  const resetUserLock = async (u: UserManageItem) => {
    try {
      await authApi.userManageResetLock(u.id);
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? {
                ...x,
                is_active: true,
                login_fail_count: 0,
                security_fail_count: 0,
                locked_until: null,
              }
            : x
        )
      );
      showToast(`${u.nickname || u.phone} 风控限制已全部重置并解除锁定`);
    } catch {
      showToast("重置失败");
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data: UserManageData = await authApi.userManageList();
      setUsers(data.users);
      if (data.security_config) {
        const sec = data.security_config.login_lock_seconds ?? ((data.security_config.login_lock_minutes || 5) * 60);
        const cfg = {
          ...data.security_config,
          login_lock_seconds: sec,
          admin_session_timeout_minutes: data.security_config.admin_session_timeout_minutes ?? 30,
        };
        setSecConfig(cfg);
        setSecConfigForm(cfg);
      }
    } catch { showToast("加载用户列表失败"); } finally { setLoading(false); }
  };

  const loadPermissions = async () => {
    setPermsLoading(true);
    try {
      const data = await authApi.adminPermissions();
      setPermDefinitions(data.definitions || []);
      setPermissionsState(data.default_permissions || {});
      // v1.88.2 同步刷新已保存基线，供分组独立保存拼装 payload
      setSavedPermissionsState(data.default_permissions || {});
    } catch {
      showToast("加载权限配置失败");
    } finally {
      setPermsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadPermissions();
  }, []);

  const startEdit = (u: UserManageItem) => {
    setEditingId(u.id);
    setEditForm({ nickname: u.nickname, role: u.role, is_staff: u.is_staff, is_active: u.is_active });
    setResetId(null); setSecId(null);
  };

  const saveEdit = async (userId: number) => {
    try {
      await authApi.userManageUpdate(userId, {
        ...editForm,
        reset_security_lock: editForm.is_active,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                ...editForm,
                login_fail_count: editForm.is_active ? 0 : u.login_fail_count,
                security_fail_count: editForm.is_active ? 0 : u.security_fail_count,
                locked_until: editForm.is_active ? null : u.locked_until,
              }
            : u
        )
      );
      setEditingId(null);
      showToast("用户信息已更新");
    } catch { showToast("更新失败"); }
  };

  // 解冻/冻结切换：当已冻结时，点击解冻并重置风控计数；当未冻结时点击冻结
  const toggleFreeze = async (u: UserManageItem) => {
    if (isAdminUser(u)) {
      showToast("管理员账号受保护，不可被冻结");
      return;
    }
    const currentlyFrozen = isUserFrozen(u);
    const targetActive = currentlyFrozen; // 若当前为冻结，则目标为解冻 (active=true)
    try {
      await authApi.userManageUpdate(u.id, {
        is_active: targetActive,
        reset_security_lock: targetActive,
      });
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? {
                ...x,
                is_active: targetActive,
                login_fail_count: targetActive ? 0 : x.login_fail_count,
                security_fail_count: targetActive ? 0 : x.security_fail_count,
                locked_until: targetActive ? null : x.locked_until,
              }
            : x
        )
      );
      showToast(targetActive ? "已成功解冻该账号并重置风控计数" : "已冻结该账号");
    } catch { showToast("操作失败"); }
  };

  const doResetPassword = async (userId: number) => {
    if (resetPwd.pwd.length < 6) { showToast("密码至少6位"); return; }
    if (resetPwd.pwd !== resetPwd.confirm) { showToast("两次输入的密码不一致"); return; }
    try {
      await authApi.userManageResetPassword(userId, resetPwd.pwd);
      setResetId(null);
      setResetPwd({ pwd: "", confirm: "", showPwd: false, showConfirm: false });
      showToast("密码已重置");
    } catch { showToast("重置失败"); }
  };

  const deleteUser = async (u: UserManageItem) => {
    if (!window.confirm(`确认删除用户「${u.nickname || u.phone}」？此操作不可恢复。`)) return;
    try {
      await authApi.userManageDelete(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      showToast("用户已删除");
    } catch { showToast("删除失败"); }
  };

  const startSecurity = (u: UserManageItem) => {
    setSecId(u.id);
    setSecForm({ question: u.security_question || "", answer: "" });
    setEditingId(null); setResetId(null);
  };

  const saveSecurity = async (userId: number) => {
    if (!secForm.question || !secForm.answer.trim()) { showToast("请选择密保问题并填写答案"); return; }
    try {
      await authApi.userManageSecurity(userId, { security_question: secForm.question, security_answer: secForm.answer });
      setSecId(null);
      showToast("密保已更新");
    } catch { showToast("密保更新失败"); }
  };

  const roleLabel = (role: string) => {
    const map: Record<string, string> = { mother: "妈妈", father: "爸爸", grandma: "奶奶/外婆", caregiver: "其他照护者", admin: "管理员" };
    return map[role] || role;
  };

  const saveSecConfig = async () => {
    if (secConfigForm.login_captcha_threshold < 1) { showToast("验证码阈值至少为1"); return; }
    if (secConfigForm.login_freeze_threshold < 2) { showToast("冻结阈值至少为2"); return; }
    if ((secConfigForm.login_lock_seconds ?? 300) < 1) { showToast("风控熔断时间至少为1秒"); return; }
    if ((secConfigForm.forgot_password_max_attempts ?? 5) < 1) { showToast("密保最大尝试次数至少为1"); return; }
    if ((secConfigForm.admin_session_timeout_minutes ?? 30) < 0) { showToast("无操作超时时长不能小于0"); return; }
    if (secConfigForm.login_freeze_threshold <= secConfigForm.login_captcha_threshold) {
      showToast("冻结阈值应大于验证码阈值");
      return;
    }
    setSecConfigSaving(true);
    try {
      const secVal = Number(secConfigForm.login_lock_seconds || 300);
      const timeoutVal = Math.max(0, Number(secConfigForm.admin_session_timeout_minutes ?? 30));
      const res = await authApi.updateSecurityConfig({
        ...secConfigForm,
        login_lock_seconds: secVal,
        login_lock_minutes: Math.max(1, Math.floor(secVal / 60)),
        admin_session_timeout_minutes: timeoutVal,
      });
      const updated = {
        ...secConfigForm,
        ...(res.data || {}),
        login_lock_seconds: res.data?.login_lock_seconds ?? secVal,
        admin_session_timeout_minutes: res.data?.admin_session_timeout_minutes ?? timeoutVal,
      };
      setSecConfig(updated);
      setSecConfigForm(updated);
      localStorage.setItem("mengya_admin_timeout", String(timeoutVal));
      setShowSecConfig(false);
      showToast("安全风控配置已更新");
    } catch { showToast("保存失败"); } finally { setSecConfigSaving(false); }
  };

  // 打开指定用户专属权限配置弹窗
  const openUserPermissions = async (u: UserManageItem) => {
    setTargetUserModal(u);
    setTargetUserLoading(true);
    try {
      const data = await authApi.getUserPermissions(u.id);
      setTargetUserDefs(data.definitions && data.definitions.length ? data.definitions : permDefinitions);
      setTargetUserPerms(data.effective_permissions || {});
      // v1.88.2 同步记录已保存基线，供分组独立保存拼装 payload
      setSavedTargetUserPerms(data.effective_permissions || {});
      setTargetUserHasCustom(data.has_custom || false);
    } catch {
      showToast("拉取该用户权限失败，使用默认定义");
      setTargetUserDefs(permDefinitions);
      setTargetUserPerms(permissionsState);
    } finally {
      setTargetUserLoading(false);
    }
  };

  // 保存指定用户专属权限
  const saveTargetUserPermissions = async () => {
    if (!targetUserModal) return;
    setTargetUserSaving(true);
    try {
      const res = await authApi.updateUserPermissions(targetUserModal.id, targetUserPerms);
      // v1.88.2 全量保存成功后同步基线
      setSavedTargetUserPerms(targetUserPerms);
      showToast(res.message || `已保存用户 ${targetUserModal.nickname || targetUserModal.username} 的权限配置`);
      setUsers((prev) =>
        prev.map((item) =>
          item.id === targetUserModal.id
            ? { ...item, custom_permissions: res.data?.custom_permissions || targetUserPerms, has_custom: true }
            : item
        )
      );
      setTargetUserHasCustom(true);
      setTargetUserModal(null);
    } catch (err: any) {
      showToast(err.message || "保存用户权限失败，请重试");
    } finally {
      setTargetUserSaving(false);
    }
  };

  // v1.88.2 指定用户分组独立保存：仅提交该用户本分组改动
  const handleSaveTargetUserGroup = async (group: PermissionGroupMeta) => {
    if (!targetUserModal || targetUserModal.is_staff) return;
    setSavingGroupKey(group.group_key);
    try {
      let payload = { ...savedTargetUserPerms };
      group.permissions.forEach((p) => {
        payload = applyPermissionChange(payload, p.key, targetUserPerms[p.key] !== false);
      });
      const res = await authApi.updateUserPermissions(targetUserModal.id, payload);
      setSavedTargetUserPerms(payload);
      setUsers((prev) =>
        prev.map((item) =>
          item.id === targetUserModal.id
            ? { ...item, custom_permissions: res.data?.custom_permissions || payload, has_custom: true }
            : item
        )
      );
      setTargetUserHasCustom(true);
      showToast(`已保存「${group.group_name}」分组，其他分组改动未提交`);
    } catch (err: any) {
      showToast(err.message || "保存分组权限失败，请重试");
    } finally {
      setSavingGroupKey(null);
    }
  };

  // 重置指定用户权限为系统默认：用最新全局默认模板（叠加宝宝阶段）固化覆盖该用户
  const resetTargetUserToDefault = async () => {
    if (!targetUserModal) return;
    if (!window.confirm(`确定要将用户【${targetUserModal.nickname || targetUserModal.username}】的权限重置为系统默认配置吗？\n\n重置将用当前最新全局默认模板覆盖该用户现有全部权限设置，此操作不可撤销。`)) {
      return;
    }
    setTargetUserSaving(true);
    try {
      const res = await authApi.resetUserPermissions(targetUserModal.id);
      showToast(res.message || "已恢复为系统默认配置");
      const resetData = (res.data || {}) as any;
      setUsers((prev) =>
        prev.map((item) =>
          item.id === targetUserModal.id
            ? { ...item, custom_permissions: resetData?.custom_permissions || {}, has_custom: false }
            : item
        )
      );
      setTargetUserHasCustom(false);
      setTargetUserModal(null);
    } catch (err: any) {
      showToast(err.message || "重置权限失败");
    } finally {
      setTargetUserSaving(false);
    }
  };

  // 专属用户权限单项切换（递归自动联动）
  const handleToggleTargetUserPerm = (key: string) => {
    if (targetUserModal?.is_staff) return; // 管理员不可修改
    const currentVal = targetUserPerms[key] !== false;
    const nextVal = !currentVal;
    setTargetUserPerms((prev) => applyPermissionChange(prev, key, nextVal));
  };

  // 专属用户权限按组全选/全关（递归自动联动）
  const handleToggleTargetUserGroup = (group: PermissionGroupMeta, enable: boolean) => {
    if (targetUserModal?.is_staff) return;
    setTargetUserPerms((prev) => {
      let next = { ...prev };
      group.permissions.forEach((p) => {
        next = applyPermissionChange(next, p.key, enable);
      });
      return next;
    });
  };

  // 专属用户权限一键全开
  const handleEnableAllTargetUserPerms = () => {
    if (targetUserModal?.is_staff) return;
    const next: Record<string, boolean> = {};
    (targetUserDefs.length ? targetUserDefs : permDefinitions).forEach((g) => {
      g.permissions.forEach((p) => {
        next[p.key] = true;
      });
    });
    setTargetUserPerms(next);
    showToast("已一键勾选该用户全部权限项");
  };

  // 专属用户权限一键全关
  const handleDisableAllTargetUserPerms = () => {
    if (targetUserModal?.is_staff) return;
    const next: Record<string, boolean> = {};
    (targetUserDefs.length ? targetUserDefs : permDefinitions).forEach((g) => {
      g.permissions.forEach((p) => {
        next[p.key] = false;
      });
    });
    setTargetUserPerms(next);
    showToast("已一键禁用该用户全部权限项");
  };

  // 权限操作：单项切换（递归自动联动）
  const handleTogglePerm = (key: string) => {
    const currentVal = permissionsState[key] !== false;
    const nextVal = !currentVal;
    setPermissionsState((prev) => applyPermissionChange(prev, key, nextVal));
  };

  // 权限操作：按分组批量开启/关闭（递归自动联动）
  const handleToggleGroup = (group: PermissionGroupMeta, enable: boolean) => {
    setPermissionsState((prev) => {
      let next = { ...prev };
      group.permissions.forEach((p) => {
        next = applyPermissionChange(next, p.key, enable);
      });
      return next;
    });
  };

  // 权限操作：全局全选启用
  const handleEnableAllPerms = () => {
    const next: Record<string, boolean> = {};
    permDefinitions.forEach((g) => {
      g.permissions.forEach((p) => {
        next[p.key] = true;
      });
    });
    setPermissionsState(next);
    showToast("已一键勾选全部权限项");
  };

  // 权限操作：全局全选禁用
  const handleDisableAllPerms = () => {
    const next: Record<string, boolean> = {};
    permDefinitions.forEach((g) => {
      g.permissions.forEach((p) => {
        next[p.key] = false;
      });
    });
    setPermissionsState(next);
    showToast("已一键取消全部权限项");
  };

  // 权限操作：保存到后端
  const handleSavePermissions = async () => {
    setPermsSaving(true);
    try {
      await authApi.updateAdminPermissions(permissionsState);
      // v1.88.2 全量保存成功后同步基线，后续分组保存以此为底色
      setSavedPermissionsState(permissionsState);
      showToast("全局默认权限模板已保存，将应用于之后新注册用户；已有用户需手动点击「重置为系统默认」才会更新");
    } catch {
      showToast("保存权限配置失败，请重试");
    } finally {
      setPermsSaving(false);
    }
  };

  // v1.88.2 权限操作：分组独立保存 —— 仅提交本分组改动，其他分组未保存草稿不随组提交
  const handleSavePermissionGroup = async (group: PermissionGroupMeta) => {
    setSavingGroupKey(group.group_key);
    try {
      // 从已保存基线出发，逐项套用本组当前值（沿用递归联动，跨组依赖同步生效）
      let payload = { ...savedPermissionsState };
      group.permissions.forEach((p) => {
        payload = applyPermissionChange(payload, p.key, permissionsState[p.key] !== false);
      });
      await authApi.updateAdminPermissions(payload);
      // 仅更新基线，不动 UI 草稿：其他分组改动仍保留待单独保存
      setSavedPermissionsState(payload);
      showToast(`「${group.group_name}」分组权限已保存，其他分组改动未提交`);
    } catch {
      showToast("保存分组权限失败，请重试");
    } finally {
      setSavingGroupKey(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (filterRole && u.role !== filterRole) return false;
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      const matchPhone = u.phone?.toLowerCase().includes(kw);
      const matchNick = u.nickname?.toLowerCase().includes(kw);
      const matchUsername = u.username?.toLowerCase().includes(kw);
      if (!matchPhone && !matchNick && !matchUsername) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* 顶部标题与 Tab 导航 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-white p-2 shadow-xs hover:shadow-sm" onClick={() => navigate("/profile")}>
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand-500" />
              <h1 className="text-xl font-bold text-gray-800">用户与权限管控中心</h1>
            </div>
            <p className="mt-0.5 text-xs text-gray-400">
              管理平台用户账号、登录风控阈值及普通用户全系统细粒度菜单与增删改查权限
            </p>
          </div>
        </div>

        {/* 顶部主选项卡切换 */}
        <div className="flex rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "users"
                ? "bg-white text-gray-800 shadow-2xs"
                : "text-gray-500 hover:text-gray-800"
            }`}
            onClick={() => setActiveTab("users")}
          >
            <Users className="h-4 w-4" />
            <span>用户账号管理 ({users.length})</span>
          </button>
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "permissions"
                ? "bg-white text-brand-600 shadow-2xs"
                : "text-gray-500 hover:text-gray-800"
            }`}
            onClick={() => setActiveTab("permissions")}
          >
            <Sliders className="h-4 w-4 text-brand-500" />
            <span>全局默认权限模板 ({permTotalCount || Object.keys(permissionsState).length}项)</span>
          </button>
        </div>
      </div>

      {/* ======================= Tab 1: 用户账号与安全风控 ======================= */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {/* 筛选与统计栏 */}
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="label mb-0 whitespace-nowrap">角色筛选</label>
              <select
                className="input flex-1"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
              >
                {ROLE_LABELS.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>

              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  className="input pl-9"
                  placeholder="搜索昵称/手机号..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                />
              </div>

              <button
                className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-500 hover:bg-brand-100"
                onClick={() => navigate("/admin/audit-logs")}
              >
                <ClipboardList className="h-3.5 w-3.5" /> 审计日志
              </button>
              <button
                className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-500 hover:bg-brand-100"
                onClick={() => { setShowSecConfig((v) => !v); setSecConfigForm(secConfig); }}
              >
                <Settings className="h-3.5 w-3.5" /> 登录安全风控
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded-full bg-gray-50 px-2.5 py-1">共 {users.length} 位用户</span>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-600 font-medium">管理员 {users.filter((u) => u.is_staff).length} 位</span>
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-500 font-medium">
                已冻结 {users.filter(isUserFrozen).length} 位
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-600">
                触发风控 {users.filter((u) => (u.login_fail_count ?? 0) >= secConfig.login_captcha_threshold).length} 位
              </span>
            </div>
          </div>

          {/* 安全风控配置面板 */}
          {showSecConfig && (
            <section className="card space-y-3 border border-orange-200 bg-orange-50/20 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-brand-500" />
                  <h2 className="font-bold text-gray-800">登录安全风控与找回密码阈值配置</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSecConfig(false)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500">
                当前风控规则：连续密码失败 {secConfig.login_captcha_threshold} 次开启验证码，{secConfig.login_freeze_threshold} 次直接冻结账号（熔断锁定 {secConfig.login_lock_seconds ?? (secConfig.login_lock_minutes * 60)} 秒 / 约 {Math.ceil((secConfig.login_lock_seconds ?? (secConfig.login_lock_minutes * 60)) / 60)} 分钟）；找回密码密保最多尝试 {secConfig.forgot_password_max_attempts ?? 5} 次；全员登录无操作超时 {(secConfig.admin_session_timeout_minutes ?? 30) > 0 ? `${secConfig.admin_session_timeout_minutes ?? 30} 分钟` : "已禁用"}。
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <div>
                  <label className="label text-xs">开启验证码次数（≥1）</label>
                  <input
                    type="number"
                    min={1}
                    className="input"
                    value={secConfigForm.login_captcha_threshold}
                    onChange={(e) => setSecConfigForm((f) => ({ ...f, login_captcha_threshold: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="label text-xs">冻结账号次数（≥2）</label>
                  <input
                    type="number"
                    min={2}
                    className="input"
                    value={secConfigForm.login_freeze_threshold}
                    onChange={(e) => setSecConfigForm((f) => ({ ...f, login_freeze_threshold: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="label text-xs">风控熔断时长（秒）</label>
                  <input
                    type="number"
                    min={1}
                    className="input"
                    value={secConfigForm.login_lock_seconds}
                    onChange={(e) => {
                      const sec = Number(e.target.value);
                      setSecConfigForm((f) => ({
                        ...f,
                        login_lock_seconds: sec,
                        login_lock_minutes: Math.max(1, Math.floor(sec / 60)),
                      }));
                    }}
                  />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[
                      { label: "30秒(测试)", val: 30 },
                      { label: "60秒(1分)", val: 60 },
                      { label: "300秒(5分)", val: 300 },
                      { label: "600秒(10分)", val: 600 },
                    ].map((btn) => (
                      <button
                        key={btn.val}
                        type="button"
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          secConfigForm.login_lock_seconds === btn.val
                            ? "bg-brand-500 text-white font-bold"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        onClick={() =>
                          setSecConfigForm((f) => ({
                            ...f,
                            login_lock_seconds: btn.val,
                            login_lock_minutes: Math.max(1, Math.floor(btn.val / 60)),
                          }))
                        }
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label text-xs">密保最大尝试次数（≥1）</label>
                  <input
                    type="number"
                    min={1}
                    className="input"
                    value={secConfigForm.forgot_password_max_attempts}
                    onChange={(e) => setSecConfigForm((f) => ({ ...f, forgot_password_max_attempts: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="label text-xs">登录会话无操作超时（分钟，全员通用）</label>
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    className="input"
                    value={secConfigForm.admin_session_timeout_minutes ?? 30}
                    onChange={(e) => setSecConfigForm((f) => ({ ...f, admin_session_timeout_minutes: Math.max(0, Number(e.target.value)) }))}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">覆盖全平台所有登录账号，闲置达指定分钟数自动安全退出；0表示禁用超时。</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[
                      { label: "1分(测试)", val: 1 },
                      { label: "15分(严格)", val: 15 },
                      { label: "30分(推荐)", val: 30 },
                      { label: "60分(1小时)", val: 60 },
                      { label: "0(禁用)", val: 0 },
                    ].map((btn) => (
                      <button
                        key={btn.val}
                        type="button"
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          (secConfigForm.admin_session_timeout_minutes ?? 30) === btn.val
                            ? "bg-brand-500 text-white font-bold"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        onClick={() =>
                          setSecConfigForm((f) => ({
                            ...f,
                            admin_session_timeout_minutes: btn.val,
                          }))
                        }
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
                  onClick={() => setShowSecConfig(false)}
                >
                  取消
                </button>
                <button
                  className="btn-primary"
                  disabled={secConfigSaving}
                  onClick={saveSecConfig}
                >
                  {secConfigSaving ? "保存中..." : "保存风控配置"}
                </button>
              </div>
            </section>
          )}

          {/* 用户列表 */}
          {loading ? (
            <div className="py-12 text-center text-gray-400">加载用户数据中...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="card py-12 text-center text-gray-400">没有找到匹配的用户</div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((u) => {
                const frozen = isUserFrozen(u);
                return (
                  <div key={u.id} className="card space-y-3 transition hover:border-gray-200 hover:shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-pink-500 font-bold text-white shadow-2xs">
                          {(u.nickname || u.phone || "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800">{u.nickname || "未设置昵称"}</span>
                            {u.is_staff && (
                              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
                                管理员 (全部权限)
                              </span>
                            )}
                            {!u.is_staff && u.has_custom && (
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600 border border-indigo-100">
                                已定制权限
                              </span>
                            )}
                            {!u.is_staff && !u.has_custom && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                                系统默认权限
                              </span>
                            )}
                            {frozen ? (
                              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-500 border border-red-200">
                                已冻结
                              </span>
                            ) : (
                              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                                正常
                              </span>
                            )}
                            {u.security_answer && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-500">
                                已设密保
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                            <span>手机：{u.phone}</span>
                            <span>角色：{roleLabel(u.role)}</span>
                            <span>注册：{u.created_at ? u.created_at.slice(0, 10) : "-"}</span>
                          </div>
                          {((u.login_fail_count ?? 0) > 0 || (u.security_fail_count ?? 0) > 0) && (
                            <div className="mt-1 flex items-center gap-2 text-xs text-amber-600">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              <span>密码错误：{u.login_fail_count ?? 0} 次</span>
                              <span>密保错误：{u.security_fail_count ?? 0} 次</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 内联编辑表单 */}
                    {editingId === u.id ? (
                      <div className="mt-3 space-y-3 rounded-xl bg-warm p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="label text-xs">昵称</label>
                            <input
                              className="input"
                              value={editForm.nickname}
                              onChange={(e) => setEditForm((f) => ({ ...f, nickname: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="label text-xs">角色</label>
                            <select
                              className="input"
                              value={editForm.role}
                              onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                            >
                              {ROLE_LABELS.filter((r) => r.key).map((r) => (
                                <option key={r.key} value={r.key}>{r.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editForm.is_staff}
                              onChange={(e) => setEditForm((f) => ({ ...f, is_staff: e.target.checked }))}
                            />
                            设为管理员
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editForm.is_staff ? true : editForm.is_active}
                              disabled={editForm.is_staff}
                              onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                            />
                            {editForm.is_staff ? "账号正常可用（管理员永不冻结）" : "账号正常可用"}
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button className="btn-primary flex-1" onClick={() => saveEdit(u.id)}>保存修改</button>
                          <button
                            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : resetId === u.id ? (
                      /* 重置密码表单 */
                      <div className="mt-3 space-y-3 rounded-xl bg-cream p-4">
                        <div className="relative">
                          <label className="label text-xs">新密码</label>
                          <input
                            type={resetPwd.showPwd ? "text" : "password"}
                            className="input pr-9"
                            placeholder="至少6位"
                            value={resetPwd.pwd}
                            onChange={(e) => setResetPwd((f) => ({ ...f, pwd: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-8 text-gray-400"
                            onClick={() => setResetPwd((f) => ({ ...f, showPwd: !f.showPwd }))}
                          >
                            {resetPwd.showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <div className="relative">
                          <label className="label text-xs">确认密码</label>
                          <input
                            type={resetPwd.showConfirm ? "text" : "password"}
                            className="input pr-9"
                            placeholder="再次输入新密码"
                            value={resetPwd.confirm}
                            onChange={(e) => setResetPwd((f) => ({ ...f, confirm: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-8 text-gray-400"
                            onClick={() => setResetPwd((f) => ({ ...f, showConfirm: !f.showConfirm }))}
                          >
                            {resetPwd.showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button className="btn-primary flex-1" onClick={() => doResetPassword(u.id)}>确认重置</button>
                          <button
                            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                            onClick={() => { setResetId(null); setResetPwd({ pwd: "", confirm: "", showPwd: false, showConfirm: false }); }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : secId === u.id ? (
                      /* 密保表单 */
                      <div className="mt-3 space-y-3 rounded-xl bg-cream p-4">
                        <div>
                          <label className="label text-xs">密保问题</label>
                          <select
                            className="input"
                            value={secForm.question}
                            onChange={(e) => setSecForm((f) => ({ ...f, question: e.target.value }))}
                          >
                            <option value="">请选择密保问题</option>
                            {SECURITY_QUESTIONS.map((q) => (
                              <option key={q.key} value={q.key}>{q.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label text-xs">密保答案</label>
                          <input
                            className="input"
                            placeholder="输入答案"
                            value={secForm.answer}
                            onChange={(e) => setSecForm((f) => ({ ...f, answer: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button className="btn-primary flex-1" onClick={() => saveSecurity(u.id)}>保存密保</button>
                          <button className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500" onClick={() => setSecId(null)}>取消</button>
                        </div>
                      </div>
                    ) : (
                      /* 操作按钮行 */
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <button
                          className="flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-600 hover:bg-brand-100"
                          onClick={() => startEdit(u)}
                          disabled={u.id === currentUser?.id}
                        >
                          <UserCog className="h-3.5 w-3.5" /> 编辑
                        </button>
                        <button
                          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition ${
                            u.is_staff
                              ? "bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium"
                              : u.has_custom
                              ? "bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 border border-indigo-200"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
                          }`}
                          onClick={() => openUserPermissions(u)}
                          title={u.is_staff ? "管理员内置全部最高权限（不可禁用）" : "针对该用户配置独立功能与菜单权限"}
                        >
                          <Shield className="h-3.5 w-3.5" />
                          <span>{u.is_staff ? "管理员权限" : u.has_custom ? "权限(已定制)" : "权限设置"}</span>
                        </button>
                        <button
                          className="flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-100"
                          onClick={() => { setResetId(u.id); setResetPwd({ pwd: "", confirm: "", showPwd: false, showConfirm: false }); setEditingId(null); setSecId(null); }}
                        >
                          <KeyRound className="h-3.5 w-3.5" /> 重置密码
                        </button>
                        <button
                          className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-100"
                          onClick={() => startSecurity(u)}
                        >
                          <ShieldQuestion className="h-3.5 w-3.5" /> 密保
                        </button>

                        {/* 状态联动按钮：管理员永不冻结；普通用户支持冻结与解冻 */}
                        {isAdminUser(u) ? (
                          (u.login_fail_count ?? 0) > 0 || (u.security_fail_count ?? 0) > 0 || !u.is_active || Boolean(u.locked_until) ? (
                            <button
                              className="flex items-center gap-1 rounded-lg bg-orange-50 px-3 py-1.5 text-xs text-orange-600 hover:bg-orange-100 transition active:scale-95"
                              onClick={() => resetUserLock(u)}
                              title="清空输错计数与解除锁定"
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> 重置风控
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-400 select-none">
                              <ShieldCheck className="h-3 w-3 text-purple-400" /> 管理员永不冻结
                            </span>
                          )
                        ) : (
                          <>
                            {((u.login_fail_count ?? 0) > 0 || (u.security_fail_count ?? 0) > 0 || !u.is_active || Boolean(u.locked_until)) && (
                              <button
                                className="flex items-center gap-1 rounded-lg bg-orange-50 px-3 py-1.5 text-xs text-orange-600 hover:bg-orange-100 transition active:scale-95 cursor-pointer"
                                onClick={() => resetUserLock(u)}
                                title="一键清空输错计数、解除锁定并解冻"
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> 重置风控
                              </button>
                            )}
                            {frozen ? (
                              <button
                                className="flex items-center gap-1 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-green-600 transition active:scale-95"
                                onClick={() => toggleFreeze(u)}
                                title="点击解冻该账号并重置失败锁定计数"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" /> 解冻账号
                              </button>
                            ) : (
                              <button
                                className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-500 hover:bg-red-100 transition active:scale-95"
                                onClick={() => toggleFreeze(u)}
                                disabled={u.id === currentUser?.id}
                              >
                                <Snowflake className="h-3.5 w-3.5" /> 冻结
                              </button>
                            )}
                          </>
                        )}

                        <button
                          className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-500 hover:bg-red-100"
                          onClick={() => deleteUser(u)}
                          disabled={u.id === currentUser?.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> 删除
                        </button>
                        {u.id === currentUser?.id && <span className="text-xs text-gray-300">（当前登录账号）</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================= Tab 2: 普通用户功能与菜单权限管控 ======================= */}
      {activeTab === "permissions" && (
        <div className="space-y-4">
          {/* 权限面板头部说明与操作栏 */}
          <div className="card space-y-4 border border-brand-100 bg-gradient-to-r from-orange-50/40 via-white to-pink-50/30 p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
                    <Sliders className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-gray-800">新用户全局默认权限模板 (CRUD 细粒度)</h2>
                </div>
                <p className="mt-1 text-xs text-gray-500 max-w-2xl">
                  此处配置仅作为【新注册用户】的初始权限底色：保存后将应用于之后新注册用户的初始权限，不会自动套用或覆盖任何已有用户。如需让某位已有用户改用最新模板，请在【用户账号管理】列表中点击该用户的【权限设置】→【重置为系统默认】。系统管理员始终默认具备全部权限，不受任何限制。
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={permsSaving || permsLoading}
                  className="btn-primary inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="h-4 w-4" />
                  <span>{permsSaving ? "保存配置中..." : "保存权限配置"}</span>
                </button>
              </div>
            </div>

            {/* 智能联动说明条 */}
            <div className="flex items-center gap-2 rounded-xl bg-blue-50/80 border border-blue-200/80 px-4 py-2.5 text-xs text-blue-700">
              <span className="font-bold shrink-0">💡 自动联动规则：</span>
              <span>
                开启子权限自动开启所有上级父权限（如开启“AI 对话”自动开启“AI 助手菜单”）；关闭父权限自动关闭其所有子功能。
              </span>
            </div>

            {/* 批量操作快捷按钮 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">快捷操作：</span>
                <button
                  type="button"
                  onClick={handleEnableAllPerms}
                  className="rounded-lg bg-green-50 px-2.5 py-1 text-green-700 font-medium hover:bg-green-100 active:scale-95 transition"
                >
                  一键开启全部
                </button>
                <button
                  type="button"
                  onClick={handleDisableAllPerms}
                  className="rounded-lg bg-red-50 px-2.5 py-1 text-red-700 font-medium hover:bg-red-100 active:scale-95 transition"
                >
                  一键禁用全部
                </button>
                <button
                  type="button"
                  onClick={loadPermissions}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 active:scale-95 transition inline-flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" /> 重置为上次保存
                </button>
              </div>

              <div className="flex items-center gap-3 text-gray-400">
                <span>
                  当前已启用：
                  <strong className="text-brand-600 ml-1">
                    {Object.values(permissionsState).filter(Boolean).length}
                  </strong>
                  / {Object.keys(permissionsState).length} 项
                </span>
              </div>
            </div>
          </div>

          {/* 权限分组渲染（v1.88.1 抽公共组件：支持搜索/折叠/层级缩进） */}
          {permsLoading ? (
            <div className="py-12 text-center text-gray-400">正在拉取权限定义与当前配置...</div>
          ) : (
            <PermissionTreeCard
              defs={permDefinitions}
              state={permissionsState}
              onTogglePerm={handleTogglePerm}
              onToggleGroup={handleToggleGroup}
              nameMap={permNameMap}
              parentMap={PERMISSION_PARENT_MAP}
              childrenMap={PERMISSION_CHILDREN_MAP}
              onGroupSave={handleSavePermissionGroup}
              savingGroupKey={savingGroupKey}
            />
          )}
        </div>
      )}

      {/* ======================= 指定具体用户专属权限配置弹窗 ======================= */}
      {targetUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow-xl overflow-hidden animate-fade-in">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gradient-to-r from-orange-50/40 via-white to-pink-50/30">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  targetUserModal.is_staff ? "bg-purple-600 text-white" : "bg-brand-500 text-white"
                } shadow-xs`}>
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-gray-800">
                      {targetUserModal.is_staff
                        ? `管理员权限概览：${targetUserModal.nickname || targetUserModal.username}`
                        : `用户独立权限管控：${targetUserModal.nickname || targetUserModal.username}`}
                    </h2>
                    {targetUserModal.is_staff ? (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                        系统管理员（最高特权）
                      </span>
                    ) : targetUserHasCustom ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                        已定制专属权限
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        系统默认权限（未单独定制）
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    账号：{targetUserModal.phone} | 角色：{roleLabel(targetUserModal.role)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setTargetUserModal(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 弹窗内容主体 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {targetUserModal.is_staff ? (
                /* 管理员提示与特权说明 */
                <div className="space-y-4">
                  <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4 text-xs text-purple-800 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-purple-900">
                      <ShieldCheck className="h-5 w-5 text-purple-600" />
                      系统管理员默认具备所有最高权限，不可禁用菜单或功能
                    </div>
                    <p className="leading-relaxed">
                      该用户具有管理员（<code>is_staff = True</code>）身份，系统内核无条件放行所有页面菜单及增删改查操作权限，保证系统运维与管控不受任何权限开关影响。
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      系统全量 {permTotalCount} 项权限状态（全部有效）
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(targetUserDefs.length ? targetUserDefs : permDefinitions).flatMap((g) => g.permissions).map((p) => (
                        <div key={p.key} className="flex items-center justify-between p-2.5 rounded-lg border border-purple-100 bg-purple-50/30 text-xs">
                          <div>
                            <span className="font-semibold text-gray-800">{p.name}</span>
                            <span className="ml-2 font-mono text-[10px] text-gray-400">{p.key}</span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-purple-700 font-semibold text-[11px]">
                            <CheckCircle2 className="h-3.5 w-3.5" /> 永久开启
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* 普通用户独立权限配置 */
                <div className="space-y-4">
                  {/* 递归自动联动提示 */}
                  <div className="flex items-center gap-2 rounded-xl bg-blue-50/80 border border-blue-200/80 px-3.5 py-2.5 text-xs text-blue-700">
                    <span className="font-bold shrink-0">💡 自动联动规则：</span>
                    <span>开启子权限自动开启其全部上级父权限；关闭父权限自动关闭其所有子功能，无需手动记忆关联。</span>
                  </div>
                  {/* 独立配置说明提示 */}
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs text-indigo-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold">针对该用户的专属独立配置：</span>
                      <span className="ml-1 text-indigo-700">
                        修改仅对用户【{targetUserModal.nickname || targetUserModal.username}】生效，不会波及其他普通用户。
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={resetTargetUserToDefault}
                        disabled={targetUserSaving}
                        className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-medium text-indigo-600 hover:bg-indigo-50 active:scale-95 transition"
                      >
                        重置为系统默认
                      </button>
                    </div>
                  </div>

                  {/* 快捷批量操作工具条 */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">快捷操作：</span>
                      <button
                        type="button"
                        onClick={handleEnableAllTargetUserPerms}
                        className="rounded-lg bg-green-50 px-2.5 py-1 text-green-700 font-medium hover:bg-green-100 active:scale-95 transition"
                      >
                        一键开启全部
                      </button>
                      <button
                        type="button"
                        onClick={handleDisableAllTargetUserPerms}
                        className="rounded-lg bg-red-50 px-2.5 py-1 text-red-700 font-medium hover:bg-red-100 active:scale-95 transition"
                      >
                        一键禁用全部
                      </button>
                    </div>

                    <div className="text-gray-400 text-xs">
                      已启用：
                      <strong className="text-brand-600 ml-1">
                        {Object.values(targetUserPerms).filter(Boolean).length}
                      </strong>
                      / {Object.keys(targetUserPerms).length || permTotalCount} 项
                    </div>
                  </div>

                  {/* 分组列表（v1.88.1 抽公共组件：搜索/折叠/层级缩进） */}
                  {targetUserLoading ? (
                    <div className="py-8 text-center text-gray-400 text-xs">正在拉取该用户最新权限...</div>
                  ) : (
                    <PermissionTreeCard
                      defs={targetUserDefs.length ? targetUserDefs : permDefinitions}
                      state={targetUserPerms}
                      onTogglePerm={handleToggleTargetUserPerm}
                      onToggleGroup={handleToggleTargetUserGroup}
                      nameMap={permNameMap}
                      parentMap={PERMISSION_PARENT_MAP}
                      childrenMap={PERMISSION_CHILDREN_MAP}
                      onGroupSave={handleSaveTargetUserGroup}
                      savingGroupKey={savingGroupKey}
                      compact
                    />
                  )}
                </div>
              )}
            </div>

            {/* 弹窗底部操作按钮 */}
            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3.5 bg-gray-50/50">
              <div>
                {!targetUserModal.is_staff && targetUserHasCustom && (
                  <span className="text-xs text-indigo-600 font-medium">当前已生效专属个性化权限</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTargetUserModal(null)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                >
                  {targetUserModal.is_staff ? "关闭" : "取消"}
                </button>
                {!targetUserModal.is_staff && (
                  <button
                    type="button"
                    onClick={saveTargetUserPermissions}
                    disabled={targetUserSaving || targetUserLoading}
                    className="btn-primary inline-flex items-center gap-1.5 text-xs shadow-sm"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{targetUserSaving ? "保存中..." : "保存该用户权限"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
