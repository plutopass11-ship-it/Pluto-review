const http = require('http');

const options = {
    hostname: '192.168.1.60',
    port: 3002,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
};

const req = http.request(options, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const token = JSON.parse(body).access_token;
        
        // Fetch project
        http.get('http://192.168.1.60:3002/api/data/projects', { headers: { Authorization: `Bearer ${token}` } }, res2 => {
            let body2 = '';
            res2.on('data', chunk => body2 += chunk);
            res2.on('end', () => {
                const projects = JSON.parse(body2);
                const projectId = projects[0].id;
                
                // Fetch tasks
                http.get(`http://192.168.1.60:3002/api/data/tasks?project_id=${projectId}`, { headers: { Authorization: `Bearer ${token}` } }, res3 => {
                    let body3 = '';
                    res3.on('data', chunk => body3 += chunk);
                    res3.on('end', () => {
                        const tasks = JSON.parse(body3);
                        console.log('Task example:', JSON.stringify(tasks[0], null, 2));
                    });
                });
            });
        });
    });
});

req.write(JSON.stringify({ email: 'plutobase@flyingpluto.ai', password: 'Styx@001' }));
req.end();
