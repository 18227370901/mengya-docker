import React, { useEffect, useState, useMemo } from "react";
import { PlatformUserOption } from "@/types/platform";
import { platformApi } from "@/api/platform";
import { Search, CheckSquare, Square, Check, User as UserIcon } from "lucide-react";

interface Props {
  selectedUserIds: number[];
  onChange: (ids: number[]) => void;
}

const roleMap: Record<string, string> = {
  mother: "妈妈",
  father: "爸爸",
  grandma: "长辈",
  caregiver: "照料者",
  admin: "管理员",
};

export const UserSelectPicker: React.FC<Props> = ({ selectedUserIds, onChange }) => {
  const [users, setUsers] = useState<PlatformUserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    platformApi
      .getUserOptions()
      .then((res) => {
        if (active) setUsers(res.data.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.nickname && u.nickname.toLowerCase().includes(q)) ||
        (u.phone && u.phone.includes(q)) ||
        (u.username && u.username.toLowerCase().includes(q))
    );
  }, [users, search]);

  const isAllSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedUserIds.includes(u.id));

  const handleToggleOne = (id: number) => {
    if (selectedUserIds.includes(id)) {
      onChange(selectedUserIds.filter((x) => x !== id));
    } else {
      onChange([...selectedUserIds, id]);
    }
  };

  const handleSelectAllFiltered = () => {
    if (isAllSelected) {
      // 取消勾选当前搜索出的所有用户
      const filteredIds = new Set(filteredUsers.map((u) => u.id));
      onChange(selectedUserIds.filter((id) => !filteredIds.has(id)));
    } else {
      // 勾选当前搜索出的所有用户
      const combined = new Set([...selectedUserIds, ...filteredUsers.map((u) => u.id)]);
      onChange(Array.from(combined));
    }
  };

  const handleInvertSelection = () => {
    const filteredIds = new Set(filteredUsers.map((u) => u.id));
    const next: number[] = [];
    // 保留不在当前搜索范围内的选中用户
    selectedUserIds.forEach((id) => {
      if (!filteredIds.has(id)) next.push(id);
    });
    // 翻转当前搜索范围内的选中状态
    filteredUsers.forEach((u) => {
      if (!selectedUserIds.includes(u.id)) next.push(u.id);
    });
    onChange(next);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
      {/* 搜索与工具按钮栏 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索昵称或手机号..."
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2.5 text-xs focus:border-brand-500 focus:outline-none"
          />
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSelectAllFiltered}
            className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-200"
          >
            {isAllSelected ? "取消全选" : "全选"}
          </button>
          <button
            type="button"
            onClick={handleInvertSelection}
            className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-200"
          >
            反选
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-200 hover:text-red-600"
          >
            清空
          </button>
        </div>
      </div>

      {/* 状态指示器 */}
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>已选中 {selectedUserIds.length} 位用户</span>
        <span>可选总人数: {users.length}</span>
      </div>

      {/* 用户网格/列表 */}
      {loading ? (
        <div className="py-6 text-center text-xs text-gray-400">加载用户列表中...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="py-6 text-center text-xs text-gray-400">未找到匹配的用户</div>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1 divide-y divide-gray-50 pr-1">
          {filteredUsers.map((u) => {
            const checked = selectedUserIds.includes(u.id);
            return (
              <div
                key={u.id}
                onClick={() => handleToggleOne(u.id)}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                  checked ? "bg-brand-50/70 border border-brand-200" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      checked
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {u.nickname ? u.nickname.slice(0, 1) : <UserIcon className="h-3 w-3" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-800">
                        {u.nickname || u.username || u.phone}
                      </span>
                      {u.is_staff && (
                        <span className="rounded bg-purple-50 px-1 py-0.2 text-[9px] text-purple-600 font-medium">
                          管理员
                        </span>
                      )}
                      <span className="rounded bg-amber-50 px-1 py-0.2 text-[9px] text-amber-600">
                        {roleMap[u.role] || u.role}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">{u.phone}</span>
                  </div>
                </div>

                <div
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    checked
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-gray-300 bg-white"
                  }`}
                >
                  {checked && <Check className="h-3 w-3" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
