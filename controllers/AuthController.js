var _ = require('lodash');
const axios = require('axios').default;
const GoogleSpreadsheet = require("google-spreadsheet").GoogleSpreadsheet;
const Handlebars = require("handlebars");
const Joi = require("joi");
const mjml2html = require("mjml");
const moment = require("moment");
const momentT = require("moment-timezone");
const http = require('http');
const Bundle = require("../models/Bundle");
const BundleCategory = require("../models/BundleCategory");
const Subscription = require("../models/Subscription");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const UserTip = require("../models/UserTip");
import { sendPushNotificationViaOneSignal } from "../utils/pushNotification";

const fs = require('fs')
const sendEmail = require("../utils/emails")
const {randomString} = require("../utils/numbers");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
var passport = require('passport');

/**
 * AuthController
 */
class AuthController {
    static middleware() {
        return {
            LoggedIn: ["logout"],
            "@google": passport.authenticate("google", {
                failureRedirect: `${process.env.FRONT_END}/login`,
                scope: ["email", "profile"]
            }),
            "@twitter": passport.authenticate("twitter")
        };
    }

    /**
     * Example controller action.
     * @param {Http} http
     */
    async register(http) {
        try {
            const schema = Joi.object({
                firstName: Joi.string().required(),
                lastName: Joi.string().required(),
                email: Joi.string().email().required(),
                phone: Joi.string().required(),
                password: Joi.string().required(),
                confirmPassword: Joi.string().required().valid(Joi.ref("password"))
            });
            const { error, value } = schema.validate(http.$body.all());
            if (error) return http.inputError(error.details);

            const { firstName, lastName, email, phone, password } = value;

            const findEmail = await User.findOne({ email });
            if (findEmail)
                return http.status(400).send({
                    status: "error",
                    msg: `Email already exists`
                });

            const findPhone = await User.findOne({ phone });
            if (findPhone)
                return http.status(400).send({
                    status: "error",
                    msg: `Phone number already exists`
                });

            let data = _.omit(value, ["password", "confirmPassword"]);

            const user = await new User()
                .set({
                    ...data,
                    password: bcrypt.hash(value.password),
                    loginToken: null,
                    level: 1,
                    createdAt: new Date()
                })
                .saveAndReturn();

            const token  = jwt.sign({ email });
            // const verifyUrl  = `/email/verify/?${$.base64.encode(token)}`;
            const verifyUrl  = `/email/verify/?${new Buffer(token).toString('base64')}`;

            // const verificationUrl = `${$.helpers.url(verifyUrl)}`
            const verificationUrl = `${process.env.FRONT_END}${verifyUrl}`;

            const source = fs.readFileSync("../storage/emails/verifyEmail.mjml", "utf8");
            const htmlOutput = mjml2html(source);
            const template = Handlebars.compile(htmlOutput.html);
            const templateData = {
                firstName,
                url: verificationUrl
            };

            // await sendMailViaSmtp({
            //     to: value.email,
            //     from: "Betweysure <noreply@betweysure.com>",
            //     sender: "noreply@betweysure.com",
            //     subject: "Registration Successful",
            //     html: template(templateData)
            // });

            sendEmail(value.email,"","Betweysure","Betweysure <noreply@betweysure.com>",
                "Registration Successful", "", template(templateData))

            return http.status(201).send({
                status: "success",
                msg: "Registration successful",
                user: _.omit(user, ["password"])
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async login(http) {
        try {
            const schema = Joi.object({
                email: Joi.string().email().required(),
                password: Joi.string().min(4).required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const { email, password } = value;

            const user = await User.findOne({ email, level: 1 });

            if (user) {
                if (!user?.has("emailVerifiedAt")) {
                    return http.status(400).send({
                        status: "error",
                        msg: "Verify your email address",
                        user: _.omit(user.data, ["password"])
                    });
                }

                const comparePassword = bcrypt.compare(password, user.get("password"));

                if (!comparePassword)
                    return http.status(401).send({
                        status: "error",
                        msg: "Invalid credentials"
                    });

                if (!user.has("loginToken") || !user.get("loginToken")) {
                    user.set("loginToken", randomString(20));
                    await user.save();
                }

                // generate token for frontend
                const loginToken  = user.get("loginToken");

                const token = jwt.sign({ id: user.id().toString(), token: loginToken });

                return http.status(200).send({
                    status: "success",
                    msg: "Logged in successfully",
                    token,
                    user: _.omit(user.data, ["password"]),
                    tokenExpireAt: moment(new Date()).add(6, "months")
                });
            }
            return http.status(401).send({
                status: "error",
                msg: "Invalid credentials"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async verifyEmail(http) {
        try {
            const code  = http.query("verificationCode");
            if (!code) {
                return http.send({
                    status: "failed",
                    msg: "Token not found"
                });
            }
            const verificationCode = new Buffer(code,'base64').toString('ascii');

            if (verificationCode) {
                const decoded = jwt.verify(verificationCode);
                const user = await User.findOne({ email: decoded.email });

                if (Date.now() <= decoded.exp + Date.now() + 60 * 60) {
                    if (!user) {
                        return http.status(403).send({
                            status: "failed",
                            msg: "Email does not exist on our database",
                            decoded
                        });
                    }

                    if (user.data.status) {
                        return http.status(401).send({
                            status: "failed",
                            msg: "Email already verified"
                        });
                    }

                    user.set({
                        status: true,
                        emailVerifiedAt: new Date()
                    });
                    await user.save();

                    return http.send({
                        status: "success",
                        msg: "Email verification successful"
                    });
                }

                return http.status(401).send({
                    status: "failed",
                    msg: "Email link expired"
                });
            } else {
                return http.status(401).send({
                    status: "failed",
                    msg: "Verification code not supplied"
                });
            }
        } catch (e) {
            return http.status(500).send({
                status: "failed",
                msg: "An error occurred, kindly try again"
            });
        }
    }

    async resendVerificationLink(http) {
        try {
            const schema = Joi.object({
                email: Joi.string().email().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const { email } = value;

            let findMail = await User.findOne({ email });
            if (!findMail) {
                return http.status(403).send({
                    status: "failed",
                    msg: "Email doesn't exist on our database"
                });
            }

            if (findMail && findMail.data.status) {
                return http.status(401).send({
                    status: "failed",
                    msg: "Email already verified"
                });
            }

            const token  = jwt.sign({ email });
            const verifyUrl  = `/email/verify/?${new Buffer(token).toString('base64')}`;

            // const verificationUrl = `${$.helpers.url(verifyUrl)}`
            const verificationUrl = `${process.env.FRONT_END}${verifyUrl}`;

            const source = fs.readFileSync("../storage/emails/verifyEmail.mjml", "utf8");
            const htmlOutput = mjml2html(source);
            const template = Handlebars.compile(htmlOutput.html);
            const templateData = {
                firstName: findMail.get("firstName"),
                url: verificationUrl
            };

            // await sendMailViaSmtp({
            //     to: value.email,
            //     from: "Betweysure <noreply@betweysure.com>",
            //     sender: "noreply@betweysure.com",
            //     subject: "Verify your account",
            //     html: template(templateData)
            // });

            sendEmail(value.email,"","Betweysure","Betweysure <noreply@betweysure.com>",
                "Verify your account", "", template(templateData))

            return http.send({
                status: "success",
                msg: "Verification mail sent successfully"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async forgotPassword(http) {
        try {
            const schema = Joi.object({
                email: Joi.string().email().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const { email } = value;

            const user = await User.findOne({ email });

            if (!user)
                return http.status(422).send({
                    status: "error",
                    msg: "An account with email doesn't exist"
                });

            const token  = jwt.sign({ email });
            const verifyUrl  = `/reset-password/${new Buffer(token).toString('base64')}`;

            // const verificationUrl = `${$.helpers.url(verifyUrl)}`
            const passwordResetUrl = `${process.env.FRONT_END}${verifyUrl}`;

            const source = fs.readFileSync("../storage/emails/resetPassword.mjml", "utf8");
            const htmlOutput = mjml2html(source);
            const template = Handlebars.compile(htmlOutput.html);

            const templateData = {
                firstName: user.get("firstName"),
                url: passwordResetUrl
            };

            // await sendMailViaSmtp({
            //     to: value.email,
            //     from: "Betweysure <noreply@betweysure.com>",
            //     sender: "noreply@betweysure.com",
            //     subject: "Reset your password",
            //     html: template(templateData)
            // });

            sendEmail(value.email,"","Betweysure","Betweysure <noreply@betweysure.com>",
                "Reset your password", "", template(templateData))

            return http.send({
                status: "success",
                msg: "Verification mail sent successfully"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async resetPassword(http) {
        try {
            const schema = Joi.object({
                token: Joi.string().required(),
                password: Joi.string().required(),
                confirmPassword: Joi.string().required().valid(Joi.ref("password"))
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const resetToken = new Buffer(value.token,'base64').toString('ascii');

            const decoded = jwt.verify(resetToken);
            const user = await User.findOne({ email: decoded.email });

            if (Date.now() <= decoded.exp + Date.now() + 60 * 60) {
                if (!user) {
                    return http.status(403).send({
                        status: "failed",
                        msg: "Email does not exist on our database",
                        decoded
                    });
                }

                user.set({
                    password: bcrypt.hash(value.password)
                });
                await user.save();

                return http.send({
                    status: "success",
                    msg: "Password reset successful"
                });
            }

            return http.status(422).send({
                status: "error",
                msg: "Token expired, kindly request a new reset link"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async logout(http) {
        try {
            const id = http.state.get("id");

            const user = await User.findById(id);

            if (user) {
                user.set("loginToken", null);
                await user.save();

                return http.send({
                    status: "success",
                    msg: "Logged out successfully"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "User not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async google() {
        return "Redirecting to Google...";
    }

    async googleCallback(http) {
        const loginUrl = `${process.env.FRONT_END}/login`;
        passport.authenticate("google", async (err, user) => {
            if (!user) return http.redirect(`${loginUrl}?oauth=false`);

            if (!user.has("loginToken") || !user.get("loginToken")) {
                user.set("loginToken", randomString(20));
                await user.save();
            }

            // generate token for frontend
            const loginToken  = user.get("loginToken");

            let token = new Buffer(jwt.sign({ id: user.id().toString(), token: loginToken })).toString('base64');

            return http.redirect(`${loginUrl}?oauth=${token}&expire=${moment(new Date()).add(6, "months")}`);
        })(http.req, http.res);
    }

    async twitter() {
        return "Redirecting to Google...";
    }

    async twitterCallback(http) {
        const loginUrl = `${process.env.FRONT_END}/login`;
        passport.authenticate("twitter", async (err, user) => {
            console.log("profile", user);
            if (!user) return http.redirect(`${loginUrl}?oauth=false`);

            if (!user.has("loginToken") || !user.get("loginToken")) {
                user.set("loginToken", randomString(20));
                await user.save();
            }

            // generate token for frontend
            const loginToken  = user.get("loginToken");

            let token = new Buffer(jwt.sign({ id: user.id().toString(), token: loginToken })).toString('base64');

            return http.redirect(`${loginUrl}?oauth=${token}&expire=${moment(new Date()).add(6, "months")}`);
        })(http.req, http.res);
    }

}

module.exports = AuthController;
