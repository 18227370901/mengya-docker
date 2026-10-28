/**
 * v1.88.1 权限树公共组件 —— 全局默认权限模板 Tab 与单用户权限弹窗共用
 *
 * 优化（决策 8）：
 * - 关键字搜索：按权限名 / 键 / 描述过滤，搜索时自动展开所有分组；
 * - 分组折叠：15 个分组过长，支持单组折叠/展开，记住折叠状态；
 * - 层级缩进：组内按 parent_key 把子权限缩进挂在父权限下方，依赖关系一目了然；
 * - 依赖徽标：显示「↳ 依赖」「含 N 项子权限」提示。
 */
import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import type { PermissionGroupMeta } from "@/api/auth";

interface PermissionTreeCardProps {
  defs: PermissionGroupMeta[];
  /** 当前权限开关状态 */
  state: Record<string, boolean>;
  /** 单项切换（递归联动在外层处理） */
  onTogglePerm: (key: string) => void;
  /** 分组全开 / 全关 */
  onToggleGroup: (group: PermissionGroupMeta, enable: boolean) => void;
  /** 权限键 → 展示名（依赖徽标用） */
  nameMap: Record<string, string>;
  /** 子权限 → 直接父权限 映射（徽标展示用） */
  parentMap: Record<string, string>;
  /** 父权限 → 子权限列表 映射（徽标展示用） */
  childrenMap: Record<string, string[]>;
  /** 弹窗内紧凑模式 */
  compact?: boolean;
  /** v1.88.2 分组保存回调：仅保存该分组的权限，不触碰其他分组草稿 */
  onGroupSave?: (group: PermissionGroupMeta) => void;
  /** v1.88.2 当前正在保存的分组键（禁用按钮 + 展示保存中） */
  savingGroupKey?: string | null;
}

export default function PermissionTreeCard({
  defs,
  state,
  onTogglePerm,
  onToggleGroup,
  nameMap,
  parentMap,
  childrenMap,
  compact = false,
  onGroupSave,
  savingGroupKey = null,
}: PermissionTreeCardProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const kw = search.trim().toLowerCase();

  /** 搜索过滤后的分组（无搜索时原样返回） */
  const visibleGroups = useMemo(() => {
    if (!kw) return defs;
    return defs
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter(
          (p) =>
            p.name.toLowerCase().includes(kw) ||
            p.key.toLowerCase().includes(kw) ||
            (p.desc || "").toLowerCase().includes(kw)
        ),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [defs, kw]);

  /** 组内排序：根权限在前，子权限缩进紧随其父 */
  const orderGroup = (perms: PermissionGroupMeta["permissions"]) => {
    const byParent: Record<string, PermissionGroupMeta["permissions"]> = {};
    for (const p of perms) {
      if (p.parent_key) {
        (byParent[p.parent_key] = byParent[p.parent_key] || []).push(p);
      }
    }
    const roots = perms.filter((p) => !p.parent_key || !perms.some((q) => q.key === p.parent_key));
    const ordered: { perm: PermissionGroupMeta["permissions"][number]; depth: number }[] = [];
    for (const r of roots) {
      ordered.push({ perm: r, depth: 0 });
      for (const c of byParent[r.key] || []) ordered.push({ perm: c, depth: 1 });
    }
    // 兜底：父权限被过滤掉时平铺展示，避免遗漏
    const placed = new Set(ordered.map((x) => x.perm.key));
    for (const p of perms) if (!placed.has(p.key)) ordered.push({ perm: p, depth: 0 });
    return ordered;
  };

  if (!defs.length) return null;

  return (
    <div className="space-y-3">
      {/* 搜索框（全树共用） */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索权限名称 / 权限键 / 描述，快速定位..."
          className={`w-full rounded-xl border border-gray-200 bg-white ${compact ? "py-1.5" : "py-2"} pl-9 pr-8 text-xs outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200`}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {visibleGroups.length === 0 && (
        <div className="py-6 text-center text-xs text-gray-400">未找到匹配的权限项，请更换关键字</div>
      )}

      {/* 分组列表 */}
      {visibleGroups.map((group) => {
        const groupEnabledCount = group.permissions.filter((p) => state[p.key] !== false).length;
        const isCollapsed = !kw && collapsed[group.group_key];

        return (
          <div
            key={group.group_key}
            className={`rounded-xl border border-gray-100 bg-white shadow-2xs ${compact ? "p-3" : "p-4"} dark:border-gray-800 dark:bg-gray-900`}
          >
            {/* 分组头部 */}
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-800">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                onClick={() => setCollapsed((prev) => ({ ...prev, [group.group_key]: !prev[group.group_key] }))}
                title={isCollapsed ? "展开该分组" : "折叠该分组"}
              >
                <ChevronDown
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 transition ${isCollapsed ? "-rotate-90" : ""}`}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className={`font-bold text-gray-800 dark:text-gray-100 ${compact ? "text-xs" : "text-sm"}`}>
                      {group.group_name}
                    </h3>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      已启用 {groupEnabledCount} / {group.permissions.length}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400">{group.description}</p>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => onToggleGroup(group, true)}
                  className="rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-600 transition hover:bg-brand-50 hover:text-brand-600 dark:bg-gray-800 dark:text-gray-300"
                >
                  全开
                </button>
                <button
                  type="button"
                  onClick={() => onToggleGroup(group, false)}
                  className="rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-600 transition hover:bg-red-50 hover:text-red-600 dark:bg-gray-800 dark:text-gray-300"
                >
                  全关
                </button>
                {/* v1.88.2 分组独立保存：只提交本组权限，避免误动其他分组草稿 */}
                {onGroupSave && (
                  <button
                    type="button"
                    disabled={savingGroupKey === group.group_key}
                    onClick={() => onGroupSave(group)}
                    title="仅保存本分组权限，其他分组改动不受影响也不会被提交"
                    className="rounded-md bg-brand-500 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
                  >
                    {savingGroupKey === group.group_key ? "保存中…" : "保存"}
                  </button>
                )}
              </div>
            </div>

            {/* 权限项（折叠时隐藏；搜索时强制展开） */}
            {!isCollapsed && (
              <div className="space-y-1.5 pt-2.5">
                {orderGroup(group.permissions).map(({ perm, depth }) => {
                  const isEnabled = state[perm.key] !== false;
                  return (
                    <div
                      key={perm.key}
                      onClick={() => onTogglePerm(perm.key)}
                      className={`flex cursor-pointer select-none items-start justify-between gap-3 rounded-xl border p-2.5 transition ${
                        isEnabled
                          ? "border-orange-200/80 bg-white shadow-2xs hover:border-brand-300 dark:bg-gray-900"
                          : "border-gray-100 bg-gray-50/80 opacity-65 hover:opacity-100 dark:bg-gray-800/60"
                      }`}
                      style={depth > 0 ? { marginLeft: "1.75rem" } : undefined}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {depth > 0 && <span className="text-[10px] text-gray-300">└</span>}
                          <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">{perm.name}</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 dark:bg-gray-800">
                            {perm.key}
                          </span>
                          {parentMap[perm.key] && (
                            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              ↳ 依赖: {nameMap[parentMap[perm.key]] || parentMap[perm.key]}
                            </span>
                          )}
                          {childrenMap[perm.key] && (
                            <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              含 {childrenMap[perm.key].length} 项子权限
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-gray-400">{perm.desc}</p>
                      </div>

                      {/* 开关 UI */}
                      <div className="relative mt-0.5 inline-flex shrink-0 items-center">
                        <div
                          className={`h-5 w-9 rounded-full transition-colors duration-200 ease-in-out ${
                            isEnabled ? "bg-brand-500" : "bg-gray-300"
                          }`}
                        >
                          <div
                            className={`ml-0.5 mt-0.5 h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                              isEnabled ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
