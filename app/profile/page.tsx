"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Save, CheckCircle, XCircle, ImagePlus, X, Upload, Trash2, AlertTriangle } from "lucide-react";

const DICEBEAR_SEEDS = [
  "Felix", "Lily", "Luna", "Max", "Nova", "Pixel",
  "Raven", "Sage", "Storm", "Terra", "Vega", "Zara",
];

const getDiceBearUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [dobIsLocked, setDobIsLocked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [profile, setProfile] = useState({
    display_name: "",
    bio: "",
    twitter_url: "",
    linkedin_url: "",
    website_url: "",
    avatar_url: "",
    date_of_birth: "", // stored as "YYYY-MM-DD"
  });

  const bucket = "avatars";
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  const avatarSrc =
    profile.avatar_url ||
    (user ? getDiceBearUrl(user.id) : getDiceBearUrl("default"));

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;
      setUser(user);

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile({
          display_name: data.display_name || "",
          bio: data.bio || "",
          twitter_url: data.twitter_url || "",
          linkedin_url: data.linkedin_url || "",
          website_url: data.website_url || "",
          avatar_url: data.avatar_url || "",
          date_of_birth: data.date_of_birth || "",
        });
        if (data.date_of_birth) {
          setDobIsLocked(true);
        }
      }

      setLoading(false);
    }

    load();
  }, []);

  async function handleSave() {
    setSaving(true);

    const updatePayload: Record<string, any> = {
      display_name: profile.display_name,
      bio: profile.bio,
      twitter_url: profile.twitter_url,
      linkedin_url: profile.linkedin_url,
      website_url: profile.website_url,
      avatar_url: profile.avatar_url,
      updated_at: new Date(),
    };

    // Only save date_of_birth if not already locked
    if (!dobIsLocked) {
      updatePayload.date_of_birth = profile.date_of_birth || null;
    }

    const { error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      showToast("error", "Failed to save changes");
      return;
    }

    // Lock DOB after first save if it was just set
    if (!dobIsLocked && profile.date_of_birth) {
      setDobIsLocked(true);
    }

    showToast("success", "Profile updated successfully");
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);

    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}.${fileExt}`;

    await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });

    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${fileName}`;

    setProfile((prev) => ({ ...prev, avatar_url: publicUrl }));

    await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", user.id);

    setUploadingAvatar(false);
    setAvatarModalOpen(false);
    showToast("success", "Avatar updated");
  }

  async function selectDiceBearAvatar(seed: string) {
    const url = getDiceBearUrl(seed);
    setProfile((prev) => ({ ...prev, avatar_url: url }));
    await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user.id);
    setAvatarModalOpen(false);
    showToast("success", "Avatar updated");
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to delete account");

      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (e: any) {
      setDeleting(false);
      showToast("error", e.message || "Failed to delete account");
    }
  }

  if (loading)
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <Loader2 className="animate-spin w-6 h-6 text-red-400" />
      </div>
    );

  const currentAge = calcAge(profile.date_of_birth);

  return (
    <div className="min-h-screen bg-black text-white px-3 md:px-6 py-8 md:py-16">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 border backdrop-blur-md transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-500/10 border-green-500/50 text-green-400"
              : "bg-red-500/10 border-red-500/50 text-red-400"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          <span className="text-xs font-light">{toast.message}</span>
        </div>
      )}

      {/* Avatar Modal */}
      {avatarModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-white/10 w-full max-w-md p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-light">Change Avatar</h3>
              <button
                onClick={() => setAvatarModalOpen(false)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                Upload Photo
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="w-full border border-dashed border-white/20 hover:border-white/40 py-6 flex flex-col items-center gap-2 transition-colors duration-200 disabled:opacity-50"
              >
                {uploadingAvatar ? (
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5 text-gray-400" />
                )}
                <span className="text-xs text-gray-500 font-light">
                  {uploadingAvatar ? "Uploading..." : "Click to upload image"}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={uploadAvatar}
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                Choose Avatar
              </p>
              <div className="grid grid-cols-6 gap-2">
                {DICEBEAR_SEEDS.map((seed) => (
                  <button
                    key={seed}
                    onClick={() => selectDiceBearAvatar(seed)}
                    className="aspect-square border border-white/10 hover:border-red-400/50 overflow-hidden transition-colors duration-200 bg-zinc-900"
                  >
                    <img src={getDiceBearUrl(seed)} alt={seed} className="w-full h-full" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        <div className="mb-4 md:mb-8">
          <h1 className="text-xl md:text-4xl font-extralight tracking-tight mb-1 md:mb-2">
            Your Profile
          </h1>
          <div className="w-16 h-px bg-gradient-to-r from-red-500 to-red-600" />
        </div>

        <div className="border border-white/10 p-3 md:p-6 bg-black hover:bg-white/5 transition-colors duration-300">
          {/* Avatar */}
          <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-6 pb-3 md:pb-6 border-b border-white/5">
            <div className="relative cursor-pointer" onClick={() => setAvatarModalOpen(true)}>
              <img
                src={avatarSrc}
                alt="Avatar"
                className="w-12 h-12 md:w-16 md:h-16 object-cover border border-white/20"
              />
              <div className="absolute bottom-0 right-0 bg-red-600 p-1.5 hover:bg-red-700 transition-colors duration-300">
                <ImagePlus className="w-3 h-3" />
              </div>
            </div>
            <div>
              <h2 className="text-xs md:text-base font-light">
                {profile.display_name || user.email}
              </h2>
              <p className="text-[10px] md:text-xs text-gray-500 mt-0.5 md:mt-1">
                Update your avatar
              </p>
            </div>
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-1 gap-2.5 md:gap-4">
            {/* Email — read only */}
            <div className="group">
              <label className="text-[10px] md:text-xs text-gray-500 font-light uppercase tracking-wider">
                Email
              </label>
              <input
                value={user?.email || ""}
                readOnly
                className="w-full mt-1 md:mt-1.5 bg-white/[0.03] border border-white/10 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm font-light text-gray-400 cursor-not-allowed select-none focus:outline-none"
              />
              <p className="text-[10px] text-gray-600 mt-1 font-light">
                Email cannot be changed here
              </p>
            </div>

            <InputField
              label="Display Name"
              value={profile.display_name}
              onChange={(v) => setProfile({ ...profile, display_name: v })}
            />

            <TextAreaField
              label="Bio"
              value={profile.bio}
              onChange={(v) => setProfile({ ...profile, bio: v })}
            />

            {/* Date of Birth */}
            <div className="group">
              <div className="flex items-center justify-between">
                <label className="text-[10px] md:text-xs text-gray-500 font-light uppercase tracking-wider">
                  Date of Birth
                </label>
                {dobIsLocked && currentAge !== null && (
                  <span className="text-[10px] text-gray-500 font-light">
                    Age: <span className="text-white">{currentAge}</span>
                  </span>
                )}
              </div>
              <input
                type="date"
                value={profile.date_of_birth}
                onChange={(e) =>
                  !dobIsLocked && setProfile({ ...profile, date_of_birth: e.target.value })
                }
                readOnly={dobIsLocked}
                max={new Date().toISOString().split("T")[0]}
                className={`w-full mt-1 md:mt-1.5 border border-white/10 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm font-light focus:outline-none transition-all duration-300 [color-scheme:dark] ${
                  dobIsLocked
                    ? "bg-white/[0.03] text-gray-400 cursor-not-allowed"
                    : "bg-transparent focus:border-red-500/50 group-hover:border-white/20"
                }`}
              />
              {dobIsLocked ? (
                <p className="text-[10px] text-gray-600 mt-1 font-light">
                  Date of birth cannot be changed once set · Age updates automatically each year
                </p>
              ) : (
                <p className="text-[10px] text-gray-600 mt-1 font-light">
                  Cannot be changed after saving
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-4">
              <InputField
                label="Twitter"
                value={profile.twitter_url}
                onChange={(v) => setProfile({ ...profile, twitter_url: v })}
              />
              <InputField
                label="LinkedIn"
                value={profile.linkedin_url}
                onChange={(v) => setProfile({ ...profile, linkedin_url: v })}
              />
            </div>

            <InputField
              label="Website"
              value={profile.website_url}
              onChange={(v) => setProfile({ ...profile, website_url: v })}
            />
          </div>

          {/* Save Button */}
          <div className="mt-3 md:mt-6 pt-3 md:pt-6 border-t border-white/5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 md:px-5 py-2 md:py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-[10px] md:text-xs font-light hover:shadow-lg hover:shadow-red-500/50 transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="mt-6 border border-red-500/20 bg-red-500/[0.03] p-3 md:p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xs md:text-sm font-light text-red-400">
                Delete Account
              </h3>
              <p className="text-[10px] md:text-xs text-gray-500 mt-1 font-light leading-relaxed">
                Permanently delete your account, cancel any active subscription,
                and remove your credits, profile and settings. This cannot be
                undone.
              </p>
              <button
                onClick={() => {
                  setDeleteConfirm("");
                  setDeleteModalOpen(true);
                }}
                className="mt-3 px-4 py-2 border border-red-500/40 text-red-400 hover:bg-red-500/10 text-[10px] md:text-xs font-light transition-colors duration-300 flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete my account
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-red-500/30 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-light text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Delete account
              </h3>
              <button
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleting}
                className="text-gray-500 hover:text-white transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 font-light leading-relaxed">
              This will permanently delete your account and cancel any active
              subscription. You will not be refunded for the current period. This
              action <span className="text-red-400">cannot be undone</span>.
            </p>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                Type <span className="text-white font-normal">DELETE</span> to confirm
              </label>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-full mt-1.5 bg-transparent border border-white/10 px-3 py-2 text-sm font-light focus:outline-none focus:border-red-500/50 transition-colors"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== "DELETE" || deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-light transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {deleting ? "Deleting..." : "Permanently delete"}
              </button>
              <button
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleting}
                className="px-4 py-2 border border-white/10 hover:bg-white/5 text-xs font-light transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type InputFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function InputField({ label, value, onChange }: InputFieldProps) {
  return (
    <div className="group">
      <label className="text-[10px] md:text-xs text-gray-500 font-light uppercase tracking-wider">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 md:mt-1.5 bg-transparent border border-white/10 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm font-light focus:outline-none focus:border-red-500/50 group-hover:border-white/20 transition-all duration-300"
      />
    </div>
  );
}

type TextAreaFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function TextAreaField({ label, value, onChange }: TextAreaFieldProps) {
  return (
    <div className="group">
      <label className="text-[10px] md:text-xs text-gray-500 font-light uppercase tracking-wider">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full mt-1 md:mt-1.5 bg-transparent border border-white/10 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm font-light focus:outline-none focus:border-red-500/50 group-hover:border-white/20 transition-all duration-300 resize-none"
      />
    </div>
  );
}
