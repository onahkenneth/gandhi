var r = require('rethinkdb');
var passwords = require('../utils/passwords.js');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');

module.exports = function(config, app, resources){

	app.post('/users', function(req, res){

		// add timestamps
		req.body.created = req.body.updated = r.now();

		// encrypt the password
		req.body.password = passwords.encrypt(req.body.password);


		// TODO: validate against schema


		resources.db.acquire(function(err, conn) {
			if(err)
				return res.error(err);

			// verify email is not already taken
			r.table('users').filter({email: req.body.email}).limit(1).run(conn, function(err, cursor){
				if(err) {
					resources.db.release(conn);
					return res.error(err);
				}

				if(cursor.hasNext()){
					resources.db.release(conn);
					return res.error(409, "An account already exists with this email");
				}

				// insert the user
				r.table('users').insert(req.body, {returnVals: true}).run(conn, function(err, result){
					resources.db.release(conn);

					if(err)
						return res.error(err);

					var user = result.new_val;

					// sanatize sensitive fields
					delete user.password;

					return res.data(203, user);
				});
			});
		});
	});

	app.get('/users', function(req, res){
		resources.db.acquire(function(err, conn) {
			if(err)
				return res.error(err);

			r.table('users').run(conn, function(err, cursor){
				if(err) {
					resources.db.release(conn);
					return res.error(err);
				}

				// output as an array
				cursor.toArray(function(err, users){
					resources.db.release(conn);

					if(err)
						return res.error(err);

					// sanatize sensitive fields
					users.forEach(function(user){
						delete user.password;
					});

					return res.data(users);
				});
			});
		});
	});

	app.get('/users/:user', function(req, res){
		resources.db.acquire(function(err, conn) {
			if(err)
				return res.error(err);

			// get users from the DB
			r.table('users').get(req.params.user).run(conn, function(err, user){
				resources.db.release(conn);

				if(err)
					return res.error(err);

				if(!user)
					return res.error(404);

				// sanatize sensitive fields
				delete user.password;

				return res.data(user);
			});
		});
	});

	app.patch('/users/:user', function(req, res){

		// add timestamps
		req.body.updated = r.now();

		// encrypt the password
		if(req.body.password)
			req.body.password = passwords.encrypt(req.body.password);


		// TODO: validate against schema


		resources.db.acquire(function(err, conn) {
			if(err)
				return res.error(err);

			// verify email is not already taken by a different user
			r.table('users').filter({email: req.body.email}).limit(1).run(conn, function(err, cursor){
				if(err) {
					resources.db.release(conn);
					return res.error(err);
				}

				cursor.toArray(function(err, existing){
					if(err) {
						resources.db.release(conn);
						return res.error(err);
					}

					if(existing && existing[0] && existing[0].id != req.params.user){
						resources.db.release(conn);
						return res.error(409, "An account already exists with this email");
					}

					// update the user
					r.table('users').get(req.params.user).update(req.body, {returnVals: true}).run(conn, function(err, result){
						resources.db.release(conn);

						if(err)
							return res.error(err);

						var user = result.new_val;

						// sanatize sensitive fields
						delete user.password;

						return res.data(200, user);
					});
				});
			});
		});
	});

	app.del('/users/:user', function(req, res){
		resources.db.acquire(function(err, conn) {
			if(err)
				return res.error(err);

			// get users from the DB
			r.table('users').get(req.params.user).delete({returnVals: true}).run(conn, function(err, result){
				resources.db.release(conn);

				if(err)
					return res.error(err);

				var user = result.old_val;

				// sanatize sensitive fields
				delete user.password;

				return res.data(user);
			});
		});
	});

	app.get('/users/:user/files/:file', function(req, res){
		var root = path.dirname(require.main.filename) + '/files/' + req.params.user + '/';
		var file = root + '/' + req.params.file;

		if(!fs.existsSync(file))
			return res.error(404);

		return res.sendfile(file);
	})

	app.post('/users/:user/files', function(req, res){
		var response = {};
		_.each(req.files, function(file){

			// build the destination root
			var root = path.dirname(require.main.filename) + '/files/' + req.params.user + '/';

			// name the file
			var filename = Date.now() + '-' + file.originalFilename;

			// make sure user files directory exists
			if(!fs.existsSync(root))
				fs.mkdirSync(root);

			// move the file to its destination
			fs.renameSync(file.path, root + filename)

			response[file.fieldName] = {
				path: '/users/' + req.params.user + '/files/' + filename,
				filename: filename
			};
		});

		// TODO: record this in the DB along with the user, etc

		res.send(200, response);
	});

};
