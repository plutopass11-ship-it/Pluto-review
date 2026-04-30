const kitsuConfig = {
  apiUrl: 'http://192.168.1.60:3002/api',
  email: 'plutobase@flyingpluto.ai',
  password: 'Styx@001'
};

(async () => {
    try {
        const res = await fetch(`${kitsuConfig.apiUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: kitsuConfig.email, password: kitsuConfig.password }),
        });
        const data = await res.json();
        
        if (data.access_token) {
            const previewRes = await fetch(`${kitsuConfig.apiUrl}/data/preview-files?limit=1`, {
                headers: { Authorization: `Bearer ${data.access_token}`, 'Content-Type': 'application/json' }
            });
            const previews = await previewRes.json();
            if (previews.length > 0) {
                const previewId = previews[0].id;
                console.log("preview id:", previewId);
                const localNextRes = await fetch(`http://localhost:3000/api/download-watermarked?id=${previewId}&name=test_shot&user=test_user`);
                console.log("response status:", localNextRes.status);
                console.log("response headers:", Object.fromEntries(localNextRes.headers.entries()));
            } else {
                console.log("No previews found in kitsu");
            }
        }
    } catch(e) { console.error('fetch error', e); }
})();
