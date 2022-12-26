const Joi = require("joi");
const _ = require("lodash");
const urlSlug = require("url-slug");
const Post = require("../models/Post");
const Postcat = require("../models/Postcat");

/**
 * BlogsController
 */
class BlogsController {
    /**
     * Example controller action.
     * @param {Http} http
     */
    async createPost(http) {
        try {
            const schema = Joi.object({
                title: Joi.string().required(),
                category: Joi.string().required(),
                body: Joi.string().required(),
                image: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const checkIfExist = await Post.findOne({ title: value.title });
            if (checkIfExist)
                return http.status(400).send({
                    status: "error",
                    msg: `Post with title ${value.title} already exists - SEO validation failed`
                });

            const createPost = await new Post()
                .set({
                    title: value.title,
                    category: Postcat.id(value.category),
                    body: value.body,
                    image: value.image,
                    slug: urlSlug(value.title),
                    createdAt: new Date()
                })
                .saveAndReturn();

            return http.status(201).send({
                status: "success",
                msg: "Blog post created successfully",
                post: createPost.data
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async fetchPosts(http) {
        try {
            const page = http.params.page;
            const perPage = http.params.perPage;

            // Pagination of all posts
            const posts = await Post.paginate(
                page,
                perPage,
                {},
                {
                    sort: {
                        createdAt: -1
                    }
                }
            );

            if (posts) {
                const clone = _.cloneDeep(posts.data);
                let newPosts = [];
                for (const cat of clone) {
                    const index = clone.indexOf(cat);
                    const findCategory = await Postcat.findById(cat.category.toString());
                    if (findCategory) {
                        cat.category = findCategory.data;
                        newPosts.push(cat);
                    }
                }

                return http.send({
                    status: "success",
                    msg: "Posts Fetched Successfully",
                    data: newPosts,
                    meta: _.omit(posts, ["data"])
                });
            }

            return http.status(422).send({
                status: "error",
                msg: "Unable to fetch posts"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async singlePost(http) {
        try {
            const slug = http.params.slug;

            const findPost = await Post.findOne({ slug });

            if (findPost) {
                return http.send({
                    status: "success",
                    data: findPost.data
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Post not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    /**
     *
     * @param http
     */
    async singleCat(http) {
        try {
            const slug = http.params.slug;

            const findCat = await Postcat.findOne({ slug });

            if (findCat) {
                return http.send({
                    status: "success",
                    data: findCat.data
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Category not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async deletePost(http) {
        try {
            const slug = http.params.slug;

            const findPost = await Post.findOne({ slug });
            if (findPost) {
                await findPost.delete();
                return http.send({
                    status: "success",
                    msg: "Post deleted successfully"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Post not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async updatePost(http) {
        try {
            const schema = Joi.object({
                id: Joi.string().required(),
                title: Joi.string().required(),
                category: Joi.string().required(),
                body: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const findPost = await Post.findById(value.id);
            if (findPost) {
                findPost.set({
                    title: value.title,
                    category: Postcat.id(value.category),
                    body: value.body,
                    slug: urlSlug(value.title)
                });
                await findPost.save();

                return http.send({
                    status: "success",
                    msg: "Blog post saved successfully"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Blog post not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async fetchCategory(http) {
        try {
            const category = await Postcat.find(
                {},
                {
                    sort: {
                        createdAt: -1
                    }
                }
            );
            if (category) {
                return http.send({
                    status: "success",
                    msg: "Category fetched successfully",
                    data: category
                });
            }

            return http.status(400).send({
                status: "error",
                msg: "Unable to fetch category"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async createCat(http) {
        try {
            const schema = Joi.object({
                title: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const checkIfExist = await Postcat.findOne({ title: value.title });
            if (checkIfExist) {
                return http.status(400).send({
                    status: "error",
                    msg: "Category already exists"
                });
            }

            const category = await new Postcat()
                .set({
                    title: value.title,
                    slug: urlSlug(value.title),
                    createdAt: new Date()
                })
                .saveAndReturn();

            return http.status(201).send({
                status: "success",
                msg: "Category created successfully",
                category: category.data
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async deleteCat(http) {
        try {
            const slug = http.params.slug;

            const findCat = await Postcat.findOne({ slug });
            if (findCat) {
                await findCat.delete();
                return http.send({
                    status: "success",
                    msg: "Category deleted successfully"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Category not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async updateCat(http) {
        try {
            const schema = Joi.object({
                id: Joi.string().required(),
                title: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const findCategory = await Postcat.findById(value.id);

            if (findCategory) {
                findCategory.set({
                    title: value.title,
                    slug: urlSlug(value.title)
                });
                await findCategory.save();

                return http.send({
                    status: "success",
                    msg: "Category saved successfully"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Category not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }
}

module.exports = BlogsController;
