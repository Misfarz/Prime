
function showToast(message, type = "success") {
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    warning: "bg-yellow-500",
    default: "bg-gray-800"
  };

  const toast = document.createElement("div");
  toast.className = `toast px-4 py-2 rounded-lg text-white shadow-md ${colors[type] || colors.default} animate-slide-in`;
  toast.textContent = message;

  document.getElementById("toast-container").appendChild(toast);


  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-x-10");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

