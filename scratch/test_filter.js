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
        
        http.get('http://192.168.1.60:3002/api/data/projects', { headers: { Authorization: `Bearer ${token}` } }, res2 => {
            let body2 = '';
            res2.on('data', chunk => body2 += chunk);
            res2.on('end', () => {
                const projects = JSON.parse(body2);
                const projectId = projects[0].id;
                
                http.get('http://192.168.1.60:3002/api/data/task-types', { headers: { Authorization: `Bearer ${token}` } }, res3 => {
                    let body3 = '';
                    res3.on('data', chunk => body3 += chunk);
                    res3.on('end', () => {
                        const types = JSON.parse(body3);
                        const reviewTypeId = types.find(t => t.name === 'Client Review').id;
                        
                        console.log('Project ID:', projectId);
                        console.log('Review Type ID:', reviewTypeId);

                        http.get(`http://192.168.1.60:3002/api/data/tasks?project_id=${projectId}&task_type_id=${reviewTypeId}`, { headers: { Authorization: `Bearer ${token}` } }, res4 => {
                            let body4 = '';
                            res4.on('data', chunk => body4 += chunk);
                            res4.on('end', () => {
                                const tasks = JSON.parse(body4);
                                console.log(`Filtered tasks count: ${tasks.length}`);
                                
                                http.get(`http://192.168.1.60:3002/api/data/tasks?project_id=${projectId}`, { headers: { Authorization: `Bearer ${token}` } }, res5 => {
                                    let body5 = '';
                                    res5.on('data', chunk => body5 += chunk);
                                    res5.on('end', () => {
                                        const allTasks = JSON.parse(body5);
                                        console.log(`Total tasks count: ${allTasks.length}`);
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

req.write(JSON.stringify({ email: 'plutobase@flyingpluto.ai', password: 'Styx@001' }));
req.end();
