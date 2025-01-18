document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("getProfileButton").addEventListener("click", function () {
        scrape();
    });

    document.getElementById("refreshProfileButton").addEventListener("click", function () {
        const username = document.getElementById("username").value.trim();
        if (!username) return alert("Please enter a TikTok username.");
        profiles = profiles.filter(p => p.username !== username); // Remove old profile
        scrape(username); // Fetch new profile data
    });

    document.getElementById("batchUpload").addEventListener("change", handleBatchUpload);
});

let profiles = JSON.parse(localStorage.getItem("savedProfiles")) || [];

async function scrape(username = null) {
    if (!username) {
        username = document.getElementById("username").value.trim();
    }
    if (!username) return alert("Please enter a TikTok username.");
    if (profiles.some(p => p.username === username)) return alert("Profile already added.");

    try {
        document.getElementById("getProfileButton").innerText = "Fetching... ⏳";
        const response = await fetch(`http://localhost:3000/scrape/${encodeURIComponent(username)}`);
        const data = await response.json();

        document.getElementById("getProfileButton").innerText = "Get Profile Data"; // Reset button text

        if (data.status === 'failed') {
            alert(`Error fetching profile for ${username}: ${data.error}`);
            markFailed(username);
            return;
        }

        const profile = {
            username,
            profilePic: `http://localhost:3000${data.profilePic}?t=${new Date().getTime()}`,
            profileInfo: data.profileInfo,
            links: data.extractedLinks,
            status: 'success'
        };

        profiles.push(profile);
        saveProfiles();
        displayProfiles();

    } catch (error) {
        alert(`Error fetching data for ${username}. Try again later.`);
        document.getElementById("getProfileButton").innerText = "Get Profile Data";
    }
}

function saveProfiles() {
    localStorage.setItem("savedProfiles", JSON.stringify(profiles));
}

function displayProfiles() {
    const container = document.getElementById("profileContainer");
    container.innerHTML = "";

    profiles.forEach(profile => {
        const profileDiv = document.createElement("div");
        profileDiv.className = "profile";
        profileDiv.setAttribute("data-username", profile.username);

        let linksHTML = profile.links.length > 0
            ? profile.links.map(link => `<li><a href="${link.url}" target="_blank">${link.text}</a></li>`).join("")
            : "<li>No external links found</li>";

        profileDiv.innerHTML = `
            <button class="delete-btn" onclick="removeProfile('${profile.username}')">X</button>
            <h2>@${profile.username}</h2>
            <img class="profile-pic" src="${profile.profilePic}" onerror="this.src='/images/default.jpg'" alt="Profile Picture">
            <h3>Profile Info</h3>
            <p>${profile.profileInfo}</p>
            <h3 class="collapsible-header" onclick="toggleCollapse('${profile.username}')">Social & External Links ▸</h3>
            <div id="links-${profile.username}" class="collapsible-content" style="display: none;">
                <ul>${linksHTML}</ul>
            </div>
            <p class="status ${profile.status}">${profile.status === 'failed' ? 'Failed to Fetch Data' : 'Data Fetched Successfully'}</p>
        `;

        container.appendChild(profileDiv);
    });
}

function removeProfile(username) {
    profiles = profiles.filter(p => p.username !== username);
    saveProfiles();
    displayProfiles();
}

function clearAllProfiles() {
    profiles = [];
    saveProfiles();
    displayProfiles();
    alert("All profiles have been cleared.");
}

function toggleCollapse(username) {
    const content = document.getElementById(`links-${username}`);
    if (content) {
        if (content.style.display === "none") {
            content.style.display = "block";
            document.querySelector(`.profile[data-username="${username}"] .collapsible-header`).innerHTML = "Social & External Links ▾";
        } else {
            content.style.display = "none";
            document.querySelector(`.profile[data-username="${username}"] .collapsible-header`).innerHTML = "Social & External Links ▸";
        }
    }
}

function markFailed(username) {
    const profileDiv = document.querySelector(`.profile[data-username="${username}"]`);
    if (profileDiv) {
        const statusElement = document.createElement("p");
        statusElement.className = "status failed";
        statusElement.innerText = "Failed to Fetch Data";
        profileDiv.appendChild(statusElement);
    }
}

function handleBatchUpload() {
    const fileInput = document.getElementById("batchUpload");
    const statusText = document.getElementById("uploadStatus");

    if (!fileInput.files.length) {
        statusText.innerText = "Please select a file.";
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(event) {
        const usernames = event.target.result
            .split(/\r?\n/)  // Split by new line
            .map(line => line.trim())  // Remove extra spaces
            .filter(line => line.startsWith("Username: "))  // Extract only usernames
            .map(line => line.replace("Username: ", ""));  // Remove "Username: " prefix

        if (usernames.length === 0) {
            statusText.innerText = "No valid usernames found in file.";
            return;
        }

        statusText.innerText = `Extracting ${usernames.length} profiles...`;

        usernames.forEach(username => scrape(username)); // Process each username
    };

    reader.readAsText(file);
}

// Load profiles when page opens
window.onload = displayProfiles;
